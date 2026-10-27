// Package createpaymentmethodsession opens a provider-hosted page where a
// customer saves a payment method, for its invoices to be charged
// automatically. The provider's customer is ensured first.
package createpaymentmethodsession

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/paymentmethods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CreatePaymentMethodSession"

// NewPaymentMethodSession is the page asked for.
type NewPaymentMethodSession struct {
	ReturnURL string  `json:"returnUrl" doc:"Where the customer comes back to: https, or http on localhost. The session id is appended as kaiten_setup_session" example:"https://app.example.test/billing"`
	Currency  *string `json:"currency,omitempty" doc:"The currency the payment method is set up in; required when the customer has no live subscription, whose currency is used otherwise" example:"EUR"`
}

// PaymentMethodSession is a hosted setup page.
type PaymentMethodSession struct {
	URL       string    `json:"url" doc:"The provider's page; send the customer there"`
	SessionID string    `json:"sessionId" doc:"Complete it with POST …/payment-method-session/{sessionId}/complete once the customer is back"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type UseCase struct{ deps access.Deps }

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute ensures the provider's customer and opens the page.
func (u *UseCase) Execute(ctx context.Context, customerSlug string, cmd NewPaymentMethodSession) (*PaymentMethodSession, error) {
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
	currency, err := u.currency(ctx, q, user.OrganizationID, customer.ID, cmd.Currency)
	if err != nil {
		return nil, err
	}
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return nil, err
	}
	email := ""
	if customer.BillingEmail != nil {
		email = *customer.BillingEmail
	}
	externalID, err := providers.EnsureCustomer(ctx, q, conn, user.OrganizationID,
		providers.Customer{ID: customer.ID, Name: customer.Name, Email: email}, u.deps.ProviderTimeout, now)
	if err != nil {
		return nil, providers.APIError(operation, err)
	}
	callCtx, cancel := providers.Bound(ctx, u.deps.ProviderTimeout)
	defer cancel()
	link, err := conn.Adapter.CreateSetupSession(callCtx, conn.Ref, provider.SetupSession{
		ExternalCustomerID: externalID, Currency: currency, ReturnURL: cmd.ReturnURL,
		// How sync recognizes a session Kaiten created (§12.6 rule 4).
		Metadata: map[string]string{"kaiten_customer_id": customer.ID.String(), "kaiten_organization_id": user.OrganizationID.String()},
	})
	if err != nil {
		return nil, providers.APIError(operation, err)
	}
	return &PaymentMethodSession{URL: link.URL, SessionID: link.SessionID, ExpiresAt: link.ExpiresAt}, nil
}

// currency is the customer's live subscription's, else the one asked for.
func (u *UseCase) currency(ctx context.Context, q *db.Queries, organizationID, customerID uuid.UUID, asked *string) (string, error) {
	live, err := q.GetLiveSubscriptionCurrency(ctx, db.GetLiveSubscriptionCurrencyParams{OrganizationID: organizationID, CustomerID: &customerID})
	if err == nil {
		return live, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}
	if asked == nil || *asked == "" {
		return "", kaitenerrors.UnprocessableEntity(operation+".CurrencyRequired",
			"the customer has no live subscription: say which currency the payment method is set up in")
	}
	if _, err := money.ParseCurrency(*asked); err != nil {
		return "", kaitenerrors.UnprocessableEntityf(operation+".InvalidCurrency", "%s is not an ISO 4217 currency", *asked)
	}
	return *asked, nil
}
