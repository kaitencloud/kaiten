// Package createportalsession opens the payment provider's hosted portal for
// a customer: payment methods, invoices and billing details, managed there.
// Changes reach Kaiten through sync.
package createportalsession

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/paymentmethods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CreatePortalSession"

// NewPortalSession is where the customer comes back to.
type NewPortalSession struct {
	ReturnURL string `json:"returnUrl" doc:"https, or http on localhost" example:"https://app.example.test/billing"`
}

// PortalSession is the portal's address. Stripe's portal sessions carry no expiry.
type PortalSession struct {
	URL string `json:"url"`
}

type UseCase struct{ deps access.Deps }

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute opens the portal.
func (u *UseCase) Execute(ctx context.Context, customerSlug string, cmd NewPortalSession) (*PortalSession, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if err := paymentmethods.ValidateReturnURL(operation, cmd.ReturnURL); err != nil {
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
	if !conn.Adapter.Capabilities().BillingPortal {
		return nil, kaitenerrors.UnprocessableEntity(operation+".CapabilityUnsupported", "the payment provider has no customer portal")
	}
	mapped, err := q.GetCustomerBilling(ctx, db.GetCustomerBillingParams{
		OrganizationID: user.OrganizationID, CustomerID: customer.ID, ProviderKind: db.BillingProviderKind(conn.Adapter.Kind()),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.UnprocessableEntity(operation+".CustomerNotOnProvider", "the customer is not in the payment provider yet")
	}
	if err != nil {
		return nil, err
	}
	callCtx, cancel := providers.Bound(ctx, u.deps.ProviderTimeout)
	defer cancel()
	url, err := conn.Adapter.CreateBillingPortalSession(callCtx, conn.Ref, mapped.ExternalCustomerID, cmd.ReturnURL)
	if err != nil {
		return nil, providers.APIError(operation, err)
	}
	return &PortalSession{URL: url}, nil
}
