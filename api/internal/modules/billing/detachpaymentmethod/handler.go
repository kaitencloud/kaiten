// Package detachpaymentmethod removes a customer's payment method from the
// payment provider, refused while a live subscription of the customer is
// charged automatically: switch it to SEND_INVOICE first.
package detachpaymentmethod

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/paymentmethods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "DetachPaymentMethod"

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute detaches the payment method in the provider, then clears its labels.
func (u *UseCase) Execute(ctx context.Context, customerSlug string) error {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return err
	}
	q := u.deps.Queries(ctx)
	customer, err := paymentmethods.Customer(ctx, q, user.OrganizationID, customerSlug, operation)
	if err != nil {
		return err
	}
	conn, err := paymentmethods.Capturing(ctx, u.deps, user.OrganizationID, operation)
	if err != nil {
		return err
	}
	kind := db.BillingProviderKind(conn.Adapter.Kind())
	mapped, err := q.GetCustomerBilling(ctx, db.GetCustomerBillingParams{OrganizationID: user.OrganizationID, CustomerID: customer.ID, ProviderKind: kind})
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && mapped.DefaultPaymentMethodID == nil) {
		return kaitenerrors.Conflict(operation+".NoPaymentMethod", "the customer has no payment method to detach")
	}
	if err != nil {
		return err
	}
	inUse, err := q.CountAutomaticCollection(ctx, db.CountAutomaticCollectionParams{
		OrganizationID: user.OrganizationID, CustomerID: &customer.ID, ProviderKind: kind,
	})
	if err != nil {
		return err
	}
	if inUse > 0 {
		return kaitenerrors.Conflict(operation+".InUseByAutomaticCollection",
			"a live subscription of the customer is charged automatically: switch it to SEND_INVOICE first")
	}
	callCtx, cancel := providers.Bound(ctx, u.deps.ProviderTimeout)
	err = conn.Adapter.DetachPaymentMethod(callCtx, conn.Ref, *mapped.DefaultPaymentMethodID)
	cancel()
	if err != nil {
		return providers.APIError(operation, err)
	}
	return u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		return paymentmethods.Clear(ctx, q, u.outbox, user.OrganizationID, customer.ID, customer.Slug, kind, now)
	})
}
