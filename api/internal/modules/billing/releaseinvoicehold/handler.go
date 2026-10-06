package releaseinvoicehold

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoiceaction"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "ReleaseInvoiceHold"

type UseCase struct {
	deps   access.Deps
	closer *closing.Closer
}

func NewUseCase(deps access.Deps, closer *closing.Closer) *UseCase {
	return &UseCase{deps: deps, closer: closer}
}

// Execute accepts a held invoice's figures as composed, and issues it. The
// release keeps who released it and why; the event carries the hold it left.
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
		sub, row, err := invoiceaction.Lock(ctx, q, user.OrganizationID, invoiceID, operation+".NotFound")
		if err != nil {
			return err
		}
		if row.HoldReason == nil {
			return kaitenerrors.Conflict(operation+".NotHeld", "the invoice is not held")
		}
		former, err := invoices.FromRow(row)
		if err != nil {
			return err
		}
		terms, err := u.closer.Terms(ctx, q, sub)
		if err != nil {
			return err
		}
		clock, err := q.BillingClock(ctx)
		if err != nil {
			return err
		}
		updated, err := invoices.Rewrite(ctx, q, row, nil, nil, invoices.Release{By: &user.ID, Reason: reason}, terms, clock.Time.UTC())
		if err != nil {
			return err
		}
		var detail invoices.HoldDetail
		if former.HoldDetail != nil {
			detail = *former.HoldDetail
		}
		if err := u.closer.Released(ctx, updated, user.ID.String(), detail); err != nil {
			return err
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
