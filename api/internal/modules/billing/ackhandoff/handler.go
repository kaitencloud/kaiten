package ackhandoff

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoiceaction"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "AckHandoff"

// Command acknowledges one invoice of the handoff queue.
type Command struct {
	LeaseID           *uuid.UUID
	ExternalReference *string
}

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute acknowledges that the organization's accounting system booked an
// invoice. An acknowledgement is safe to repeat: the same one again, or one
// that only adds a reference the invoice did not have, answers 200 and
// records nothing.
func (u *UseCase) Execute(ctx context.Context, invoiceID uuid.UUID, cmd Command) (*invoices.Invoice, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if cmd.ExternalReference != nil {
		if n := len([]rune(*cmd.ExternalReference)); n == 0 || n > 255 {
			return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidExternalReference", "externalReference is 1 to 255 characters")
		}
	}
	var result *invoices.Invoice
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		_, row, err := invoiceaction.Lock(ctx, q, user.OrganizationID, invoiceID, operation+".NotFound")
		if err != nil {
			return err
		}
		clock, err := q.BillingClock(ctx)
		if err != nil {
			return err
		}
		now := invoices.Timestamp(clock.Time.UTC())

		updated := row
		switch row.HandoffStatus {
		case db.HandoffStatusNOTREQUIRED:
			return kaitenerrors.Conflict(operation+".NotRequired", "this invoice is not in the handoff queue")
		case db.HandoffStatusACKNOWLEDGED:
			switch {
			case cmd.ExternalReference == nil:
			case row.ExternalReference == nil:
				updated, err = q.FillHandoffReference(ctx, db.FillHandoffReferenceParams{ExternalReference: cmd.ExternalReference, Now: now, ID: row.ID})
				if err != nil {
					return err
				}
			case *row.ExternalReference != *cmd.ExternalReference:
				return kaitenerrors.Conflict(operation+".ReferenceMismatch", "the invoice was already acknowledged under another reference")
			}
		default:
			if cmd.LeaseID != nil && (row.HandoffLeaseID == nil || *row.HandoffLeaseID != *cmd.LeaseID) {
				return kaitenerrors.Conflict(operation+".LeaseMismatch", "the invoice's lease expired and another claim took it")
			}
			updated, err = q.AcknowledgeHandoff(ctx, db.AcknowledgeHandoffParams{
				Now: now, UserID: &user.ID, ExternalReference: cmd.ExternalReference, ID: row.ID,
			})
			if err != nil {
				return err
			}
			if err := invoices.Announce(ctx, u.outbox, user.OrganizationID, events.InstanceInvoiceHandoffAcknowledged, invoices.HandoffAcknowledgement{
				InvoiceID: updated.ID, ExternalReference: updated.ExternalReference, AcknowledgedBy: user.ID,
			}); err != nil {
				return err
			}
		}
		invoice, err := invoices.FromRow(updated)
		result = &invoice
		return err
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
