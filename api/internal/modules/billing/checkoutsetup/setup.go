// Package checkoutsetup is the provider side of an anonymous checkout (Tier
// 2, §12.9): the hosted setup page that saves the visitor's payment method
// before any customer exists, and the adoption of the provider customer that
// page created. The public SDK's confirm runs it; it reuses Tier 3's setup
// calls, except that the provider, not Kaiten, creates the customer.
package checkoutsetup

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/paymentmethods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/providers"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// minimumLifetime is the shortest setup page Stripe accepts.
const minimumLifetime = 30 * time.Minute

// The metadata a setup page carries, which is how Kaiten recognizes it
// (§12.6 rule 4).
const (
	metaCheckoutSession = "kaiten_checkout_session_id"
	metaOrganization    = "kaiten_organization_id"
	metaCustomer        = "kaiten_customer_id"
)

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Request is the setup page a checkout session asks for.
type Request struct {
	CheckoutSessionID uuid.UUID
	Email             string
	Currency          string
	// ReturnURL is where the provider sends the visitor back, as it is.
	ReturnURL string
	// ExpiresAt is the checkout session's; the page lives at least
	// minimumLifetime.
	ExpiresAt time.Time
	// Replaces is the expired page this one replaces, if any.
	Replaces string
}

// Page is an open setup page.
type Page struct {
	URL       string
	SessionID string
	ExpiresAt time.Time
}

// Setup is a setup page as the provider reports it.
type Setup struct {
	Complete bool
	// Expired, or unknown to the provider: a replacement is needed.
	Expired bool
	Page    Page
	// ProviderKind, ExternalCustomerID and PaymentMethodID are set once it
	// is complete.
	ProviderKind       string
	ExternalCustomerID string
	PaymentMethodID    string
}

// Adopted is the provider customer a completed setup created, with the
// payment method now its default.
type Adopted struct {
	ProviderKind       string
	ExternalCustomerID string
	Method             provider.PaymentMethod
}

// Open creates the setup page, with no provider customer: the provider
// creates one, with the e-mail, when the visitor completes it (§12.9 step 1).
// Its key is fixed by the checkout session, a replacement's by the page it
// replaces. Outside any transaction.
func (u *UseCase) Open(ctx context.Context, organizationID uuid.UUID, operation string, req Request) (Page, error) {
	conn, err := u.capturing(ctx, organizationID, operation)
	if err != nil {
		return Page{}, err
	}
	expiresAt := req.ExpiresAt
	if floor := time.Now().Add(minimumLifetime + time.Minute); expiresAt.Before(floor) {
		expiresAt = floor
	}
	key := fmt.Sprintf("%s:checkout:%s:setup", organizationID, req.CheckoutSessionID)
	if req.Replaces != "" {
		key += ":r:" + req.Replaces
	}
	callCtx, cancel := providers.Bound(ctx, u.deps.ProviderTimeout)
	defer cancel()
	link, err := conn.Adapter.CreateSetupSession(callCtx, conn.Ref, provider.SetupSession{
		ExternalCustomerID: "", Currency: req.Currency, ReturnURL: req.ReturnURL,
		Metadata: map[string]string{
			metaCheckoutSession: req.CheckoutSessionID.String(), metaOrganization: organizationID.String(),
		},
		CustomerCreation: true, CustomerEmail: req.Email, ExpiresAt: expiresAt, IdempotencyKey: key,
	})
	if err != nil {
		return Page{}, providers.APIError(operation, err)
	}
	return Page{URL: link.URL, SessionID: link.SessionID, ExpiresAt: link.ExpiresAt}, nil
}

// Read is the stored setup page, read by its id -- never one taken from the
// redirect -- and checked to be this checkout session's.
func (u *UseCase) Read(ctx context.Context, organizationID uuid.UUID, operation string, checkoutSessionID uuid.UUID, setupSessionID string) (Setup, error) {
	conn, err := u.capturing(ctx, organizationID, operation)
	if err != nil {
		return Setup{}, err
	}
	callCtx, cancel := providers.Bound(ctx, u.deps.ProviderTimeout)
	defer cancel()
	result, err := conn.Adapter.GetSetupSession(callCtx, conn.Ref, setupSessionID)
	if providers.IsNotFound(err) {
		return Setup{Expired: true}, nil
	}
	if err != nil {
		return Setup{}, providers.APIError(operation, err)
	}
	if result.Metadata[metaCheckoutSession] != checkoutSessionID.String() || result.Metadata[metaOrganization] != organizationID.String() {
		return Setup{}, fmt.Errorf("checkout setup: page %s is not checkout session %s's", setupSessionID, checkoutSessionID)
	}
	out := Setup{
		Complete: result.Complete, Expired: result.Expired && !result.Complete,
		Page:         Page{URL: result.URL, SessionID: setupSessionID, ExpiresAt: result.ExpiresAt},
		ProviderKind: string(conn.Adapter.Kind()),
	}
	if result.Complete {
		if result.ExternalCustomerID == "" {
			return Setup{}, fmt.Errorf("checkout setup: page %s completed without a customer", setupSessionID)
		}
		out.ExternalCustomerID, out.PaymentMethodID = result.ExternalCustomerID, result.ExternalPaymentMethodID
	}
	return out, nil
}

// Adopt makes the payment method a completed setup saved the default of the
// customer it created (§12.9 step 3.2). Outside any transaction; idempotent.
func (u *UseCase) Adopt(ctx context.Context, organizationID uuid.UUID, operation string, setup Setup) (Adopted, error) {
	conn, err := u.capturing(ctx, organizationID, operation)
	if err != nil {
		return Adopted{}, err
	}
	callCtx, cancel := providers.Bound(ctx, u.deps.ProviderTimeout)
	defer cancel()
	method, err := conn.Adapter.SetDefaultPaymentMethod(callCtx, conn.Ref, setup.ExternalCustomerID, setup.PaymentMethodID)
	if err != nil {
		return Adopted{}, providers.APIError(operation, err)
	}
	return Adopted{ProviderKind: string(conn.Adapter.Kind()), ExternalCustomerID: setup.ExternalCustomerID, Method: method}, nil
}

// Link maps the new Kaiten customer to the provider customer it adopted, with
// its payment method ACTIVE, and announces the method attached (§9.12 rule
// 4 step 4). In the completion's transaction, which ctx carries.
func (u *UseCase) Link(ctx context.Context, organizationID, customerID uuid.UUID, customerSlug string, adopted Adopted) error {
	q := u.deps.Queries(ctx)
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return err
	}
	kind := db.BillingProviderKind(adopted.ProviderKind)
	if err := q.UpsertCustomerBilling(ctx, db.UpsertCustomerBillingParams{
		CustomerID: customerID, OrganizationID: organizationID, ProviderKind: kind,
		ExternalCustomerID: adopted.ExternalCustomerID, WebUrl: nil, Now: invoices.Timestamp(now),
	}); err != nil {
		return err
	}
	_, err = paymentmethods.Apply(ctx, q, u.outbox, organizationID, customerID, customerSlug, kind, adopted.Method, now)
	return err
}

// Stamp writes the Kaiten ids on the adopted provider customer, after the
// completion's commit, so that step 0's search finds it should the mapping
// be lost (§12.9 step 3.4). Best effort: a failure is logged, never retried.
func (u *UseCase) Stamp(ctx context.Context, organizationID, checkoutSessionID, customerID uuid.UUID, adopted Adopted) {
	conn, err := providers.Connect(ctx, u.deps.Providers, organizationID, db.BillingProviderKind(adopted.ProviderKind))
	if err == nil {
		callCtx, cancel := providers.Bound(ctx, u.deps.ProviderTimeout)
		err = conn.Adapter.StampCustomer(callCtx, conn.Ref, adopted.ExternalCustomerID, map[string]string{
			metaCustomer: customerID.String(), metaOrganization: organizationID.String(), metaCheckoutSession: checkoutSessionID.String(),
		}, fmt.Sprintf("%s:checkout:%s:customer", organizationID, checkoutSessionID))
		cancel()
	}
	if err != nil {
		slog.WarnContext(ctx, "anonymous checkout: the provider customer was not stamped with the Kaiten ids",
			"checkout_session_id", checkoutSessionID, "error", err)
	}
}

// Activation is the newest ACTIVATION of an instance's subscription; nil
// when there is none.
func (u *UseCase) Activation(ctx context.Context, organizationID, instanceID uuid.UUID) (*invoices.Invoice, error) {
	row, err := u.deps.Queries(ctx).GetLatestInstanceActivation(ctx, db.GetLatestInstanceActivationParams{
		OrganizationID: organizationID, InstanceID: &instanceID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil //nolint:nilnil // no ACTIVATION is an answer
	}
	if err != nil {
		return nil, err
	}
	invoice, err := invoices.FromRow(row)
	if err != nil {
		return nil, err
	}
	return &invoice, nil
}

// capturing is the connected provider that captures payment methods; a
// capture lost since the start answers 422 <operation>.ProviderCannotCapturePayment.
func (u *UseCase) capturing(ctx context.Context, organizationID uuid.UUID, operation string) (*provider.Connection, error) {
	conn, err := paymentmethods.Capturing(ctx, u.deps, organizationID, operation)
	var refusal *kaitenerrors.Error
	if errors.As(err, &refusal) && refusal.Kind == kaitenerrors.KindUnprocessable {
		return nil, kaitenerrors.UnprocessableEntity(operation+".ProviderCannotCapturePayment",
			"no connected payment provider saves payment methods any more: this checkout cannot be paid")
	}
	return conn, err
}
