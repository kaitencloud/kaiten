package markinvoicepaid

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoiceaction"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "MarkInvoicePaid"

// Command is a payment the organization records.
type Command struct {
	PaidAt            *time.Time
	ExternalReference *string
	Note              *string
}

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute records that a MANUAL invoice was paid. An invoice still waiting in
// the handoff queue is acknowledged by the same write. Marking an invoice
// paid again with the same reference answers it unchanged.
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
		sub, row, err := invoiceaction.Lock(ctx, q, user.OrganizationID, invoiceID, operation+".NotFound")
		if err != nil {
			return err
		}
		if err := invoiceaction.RefuseProviderManaged(operation, row); err != nil {
			return err
		}
		if row.Status == db.InvoiceStatusPAID && row.MarkedPaidByID != nil && sameReference(row.ExternalReference, cmd.ExternalReference) {
			invoice, err := invoices.FromRow(row)
			result = &invoice
			return err
		}
		if row.Status != db.InvoiceStatusMANUAL {
			return kaitenerrors.Conflict(operation+".InvalidStatus", "only a MANUAL invoice can be marked paid; this one is "+string(row.Status))
		}
		if row.ExternalReference != nil && cmd.ExternalReference != nil && *row.ExternalReference != *cmd.ExternalReference {
			return kaitenerrors.Conflict(operation+".ReferenceMismatch",
				"the invoice was handed off under another external reference")
		}
		clock, err := q.BillingClock(ctx)
		if err != nil {
			return err
		}
		now := clock.Time.UTC()
		paidAt := now
		if cmd.PaidAt != nil {
			paidAt = cmd.PaidAt.UTC()
			if paidAt.After(now) {
				return kaitenerrors.UnprocessableEntity(operation+".PaidAtInFuture", "paidAt is in the future")
			}
		}

		pending := row.HandoffStatus == db.HandoffStatusPENDING
		updated, err := q.MarkInvoicePaid(ctx, db.MarkInvoicePaidParams{
			PaidAt: invoices.Timestamp(paidAt), UserID: &user.ID, ExternalReference: cmd.ExternalReference,
			Now: invoices.Timestamp(now), ID: row.ID,
		})
		if err != nil {
			return err
		}
		invoice, err := invoices.FromRow(updated)
		if err != nil {
			return err
		}
		result = &invoice
		// The subscription leaves PAST_DUE once nothing of it is overdue.
		if _, err := lifecycle.Reevaluate(ctx, q, u.outbox, sub, user.ID, updated.UpdatedAt.Time.UTC(), u.deps.AutoCollectionGrace); err != nil {
			return err
		}
		if err := invoices.Announce(ctx, u.outbox, user.OrganizationID, events.InstanceInvoicePaid, invoices.PaidInvoice{
			InvoiceSummary: invoice.InvoiceSummary, Source: "MARK_PAID", ExternalReference: updated.ExternalReference, Note: cmd.Note,
		}); err != nil {
			return err
		}
		if !pending {
			return nil
		}
		return invoices.Announce(ctx, u.outbox, user.OrganizationID, events.InstanceInvoiceHandoffAcknowledged, invoices.HandoffAcknowledgement{
			InvoiceID: updated.ID, ExternalReference: updated.ExternalReference, AcknowledgedBy: user.ID,
		})
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func sameReference(stored, given *string) bool {
	if stored == nil || given == nil {
		return stored == nil && given == nil
	}
	return *stored == *given
}
