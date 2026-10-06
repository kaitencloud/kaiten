package writeoffinvoice

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

const operation = "WriteOffInvoice"

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute writes off a MANUAL invoice the organization gave up collecting. A
// handoff still pending stays so: its consumer sees the new status. Writing
// off an UNCOLLECTIBLE invoice again answers it unchanged.
func (u *UseCase) Execute(ctx context.Context, invoiceID uuid.UUID, reason string) (*invoices.Invoice, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if err := invoiceaction.Reason(operation, reason); err != nil {
		return nil, err
	}
	var result *invoices.Invoice
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		_, row, err := invoiceaction.Lock(ctx, q, user.OrganizationID, invoiceID, operation+".NotFound")
		if err != nil {
			return err
		}
		if err := invoiceaction.RefuseProviderManaged(operation, row); err != nil {
			return err
		}
		if row.Status == db.InvoiceStatusUNCOLLECTIBLE {
			invoice, err := invoices.FromRow(row)
			result = &invoice
			return err
		}
		if row.Status != db.InvoiceStatusMANUAL {
			return kaitenerrors.Conflict(operation+".InvalidStatus", "only a MANUAL invoice can be written off; this one is "+string(row.Status))
		}
		clock, err := q.BillingClock(ctx)
		if err != nil {
			return err
		}
		updated, err := q.WriteOffInvoice(ctx, db.WriteOffInvoiceParams{Now: invoices.Timestamp(clock.Time.UTC()), ID: row.ID})
		if err != nil {
			return err
		}
		invoice, err := invoices.FromRow(updated)
		if err != nil {
			return err
		}
		result = &invoice
		return invoices.Announce(ctx, u.outbox, user.OrganizationID, events.InstanceInvoiceMarkedUncollectible,
			invoices.UncollectibleInvoice{InvoiceSummary: invoice.InvoiceSummary, Reason: reason})
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
