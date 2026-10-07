package retryinvoicepush

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoiceaction"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/pushing"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "RetryInvoicePush"

type UseCase struct {
	deps   access.Deps
	pusher *pushing.Pusher
}

func NewUseCase(deps access.Deps, pusher *pushing.Pusher) *UseCase {
	return &UseCase{deps: deps, pusher: pusher}
}

// Execute puts an invoice back in the push queue now. A draft waiting for
// finalization in its provider (review mode) is finalized at once instead.
func (u *UseCase) Execute(ctx context.Context, invoiceID uuid.UUID) (*invoices.Invoice, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var row db.InstanceInvoice
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		_, locked, err := invoiceaction.Lock(ctx, q, user.OrganizationID, invoiceID, operation+".NotFound")
		if err != nil {
			return err
		}
		if locked.ProviderKind == db.BillingProviderKindNOOP ||
			(locked.Status != db.InvoiceStatusDRAFT && locked.Status != db.InvoiceStatusPUSHFAILED) {
			return kaitenerrors.Conflict(operation+".InvalidStatus", "only a payment provider's DRAFT or PUSH_FAILED invoice is pushed")
		}
		if locked.HoldReason != nil {
			return kaitenerrors.Conflict(operation+".Held", "a held invoice is released or recomposed before it is pushed")
		}
		row = locked
		if awaitsFinalization(locked) {
			return nil
		}
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		row, err = q.RequeuePush(ctx, db.RequeuePushParams{Now: invoices.Timestamp(now), ID: locked.ID})
		return err
	})
	if err != nil {
		return nil, err
	}
	if awaitsFinalization(row) {
		if err := u.pusher.Push(ctx, row.ID, true); err != nil {
			return nil, providers.APIError(operation, err)
		}
		if row, err = u.deps.Queries(ctx).GetInvoiceByID(ctx, row.ID); err != nil {
			return nil, err
		}
	}
	invoice, err := invoices.FromRow(row)
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

// awaitsFinalization: a complete draft the provider holds, waiting for a
// human (review mode).
func awaitsFinalization(row db.InstanceInvoice) bool {
	return row.Status == db.InvoiceStatusDRAFT && row.ExternalInvoiceID != nil && !row.NextPushAt.Valid
}
