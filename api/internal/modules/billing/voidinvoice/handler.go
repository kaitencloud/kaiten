package voidinvoice

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoiceaction"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "VoidInvoice"

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute voids an invoice not yet settled: a DRAFT, held or not, or a MANUAL
// one. Without a payment provider the void is local. It frees the invoice's
// boundary for a recompose; a handoff still pending stays so, and its
// consumer sees the VOID. Voiding a VOID invoice again answers it unchanged.
func (u *UseCase) Execute(ctx context.Context, invoiceID uuid.UUID, reason string) (*invoices.Invoice, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if err := invoiceaction.Reason(operation, reason); err != nil {
		return nil, err
	}
	if err := u.voidInProvider(ctx, user.OrganizationID, invoiceID); err != nil {
		return nil, err
	}
	var result *invoices.Invoice
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		sub, row, err := invoiceaction.Lock(ctx, q, user.OrganizationID, invoiceID, operation+".NotFound")
		if err != nil {
			return err
		}
		switch row.Status {
		case db.InvoiceStatusVOID:
			invoice, err := invoices.FromRow(row)
			result = &invoice
			return err
		case db.InvoiceStatusDRAFT, db.InvoiceStatusPUSHFAILED, db.InvoiceStatusMANUAL,
			db.InvoiceStatusPUSHED, db.InvoiceStatusPAYMENTFAILED:
		default:
			return kaitenerrors.Conflict(operation+".InvalidStatus", "a "+string(row.Status)+" invoice cannot be voided")
		}
		clock, err := q.BillingClock(ctx)
		if err != nil {
			return err
		}
		updated, err := q.VoidInvoice(ctx, db.VoidInvoiceParams{
			Now: invoices.Timestamp(clock.Time.UTC()), UserID: &user.ID, Reason: &reason, ID: row.ID,
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
		return invoices.Announce(ctx, u.outbox, user.OrganizationID, events.InstanceInvoiceVoided,
			invoices.VoidedInvoice{InvoiceSummary: invoice.InvoiceSummary, VoidReason: reason})
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// voidInProvider runs the provider's leg of a void, first: Kaiten shows VOID
// only once the provider confirms, so never for an invoice its customer can
// still pay. An invoice the provider has not created yet needs no leg; one it
// reports paid is refused, and sync mirrors the payment. A run of the push
// that creates the provider's invoice meanwhile finds it VOID and removes it.
func (u *UseCase) voidInProvider(ctx context.Context, organizationID, invoiceID uuid.UUID) error {
	q := u.deps.Queries(ctx)
	row, err := q.GetInvoiceByID(ctx, invoiceID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil // the transaction answers NotFound
	}
	if err != nil {
		return err
	}
	if row.OrganizationID != organizationID || row.ProviderKind == db.BillingProviderKindNOOP || row.ExternalInvoiceID == nil {
		return nil
	}
	switch row.Status {
	case db.InvoiceStatusDRAFT, db.InvoiceStatusPUSHFAILED, db.InvoiceStatusPUSHED, db.InvoiceStatusPAYMENTFAILED:
	default:
		return nil // the transaction answers the status
	}
	conn, err := providers.Connect(ctx, u.deps.Providers, organizationID, row.ProviderKind)
	if err != nil {
		return providers.APIError(operation, err)
	}
	callCtx, cancel := providers.Bound(ctx, u.deps.ProviderTimeout)
	read, err := conn.Adapter.GetInvoice(callCtx, conn.Ref, *row.ExternalInvoiceID)
	cancel()
	switch {
	case provider.ClassOf(err) == provider.ClassNotFound:
		return nil
	case err != nil:
		return providers.APIError(operation, err)
	case read.Status == provider.StatusPaid:
		return kaitenerrors.ConflictWithErrors(operation+".InvalidStatus", "the payment provider reports this invoice paid",
			&kaitenerrors.ErrorDetail{Message: "paid at the provider", Location: "provider", Value: "paid_at_provider"})
	case read.Status == provider.StatusVoid:
		return nil
	}
	callCtx, cancel = providers.Bound(ctx, u.deps.ProviderTimeout)
	defer cancel()
	if err := conn.Adapter.VoidInvoice(callCtx, conn.Ref, *row.ExternalInvoiceID); err != nil {
		return providers.APIError(operation, err)
	}
	return nil
}
