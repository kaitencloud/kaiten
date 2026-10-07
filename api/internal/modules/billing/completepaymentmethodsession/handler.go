// Package completepaymentmethodsession applies a hosted setup page the
// customer finished: checked with the provider server-side (the redirect is
// never trusted), the payment method saved becomes the one invoices are
// charged to, and its labels are kept. Idempotent.
package completepaymentmethodsession

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

const operation = "CompletePaymentMethodSession"

// CompletedPaymentMethodSession is the payment method the session saved.
type CompletedPaymentMethodSession struct {
	PaymentMethod paymentmethods.PaymentMethodLabels `json:"paymentMethod"`
}

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute checks the session with the provider and applies it.
func (u *UseCase) Execute(ctx context.Context, customerSlug, sessionID string) (*CompletedPaymentMethodSession, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	customer, err := paymentmethods.Customer(ctx, q, user.OrganizationID, customerSlug, operation)
	if err != nil {
		return nil, err
	}
	conn, err := paymentmethods.Capturing(ctx, u.deps, user.OrganizationID, operation)
	if err != nil {
		return nil, err
	}
	kind := db.BillingProviderKind(conn.Adapter.Kind())
	mapped, err := q.GetCustomerBilling(ctx, db.GetCustomerBillingParams{OrganizationID: user.OrganizationID, CustomerID: customer.ID, ProviderKind: kind})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notFound()
	}
	if err != nil {
		return nil, err
	}

	callCtx, cancel := providers.Bound(ctx, u.deps.ProviderTimeout)
	session, err := conn.Adapter.GetSetupSession(callCtx, conn.Ref, sessionID)
	cancel()
	if err != nil {
		if providersNotFound(err) {
			return nil, notFound()
		}
		return nil, providers.APIError(operation, err)
	}
	// Another customer's session answers as an unknown one.
	if session.ExternalCustomerID != mapped.ExternalCustomerID {
		return nil, notFound()
	}
	if !session.Complete {
		return nil, kaitenerrors.Conflict(operation+".SessionNotComplete", "the customer has not finished saving a payment method on that page")
	}

	callCtx, cancel = providers.Bound(ctx, u.deps.ProviderTimeout)
	method, err := conn.Adapter.SetDefaultPaymentMethod(callCtx, conn.Ref, mapped.ExternalCustomerID, session.ExternalPaymentMethodID)
	cancel()
	if err != nil {
		return nil, providers.APIError(operation, err)
	}
	var applied db.CustomerBilling
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		applied, err = paymentmethods.Apply(ctx, q, u.outbox, user.OrganizationID, customer.ID, customer.Slug, kind, method, now)
		return err
	})
	if err != nil {
		return nil, err
	}
	return &CompletedPaymentMethodSession{PaymentMethod: *paymentmethods.View(applied).PaymentMethod}, nil
}

func notFound() error {
	return kaitenerrors.NotFound(operation+".SessionNotFound", "no setup session of this customer has that id")
}

func providersNotFound(err error) bool {
	return providers.IsNotFound(err)
}
