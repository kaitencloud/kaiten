package stripe_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcustomersession"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createsessioncheckout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

const (
	storefront   = "https://app.acme.test"
	checkoutPath = "/api/public/session/checkout"
	returnURL    = storefront + "/billing"
)

type shop struct {
	plan     licenseschema.License
	monthly  prices.Price
	customer customerschema.Customer
	instance instanceschema.Instance
	token    string
}

// newShop is a public PAID plan at 29.00 EUR a month, sold through Stripe, a
// customer with a billing e-mail and an instance of it, a publishable key for
// the storefront, and a session bound to the instance. commercial is merged
// into the plan's licence.
func newShop(t *testing.T, commercial map[string]any) shop {
	t.Helper()
	connect(t, nil)
	body := map[string]any{
		"name": "Pro", "description": "d", "type": "PAID", "isDefault": true,
		"lifecycleState": licenseschema.Published, "pricingType": "PAID",
	}
	for k, v := range commercial {
		body[k] = v
	}
	plan := commonfixture.AssertJSONResponse[licenseschema.License](t, call(t, "POST", "/api/licenses", body), fiber.StatusCreated)
	families := commonfixture.AssertJSONResponse[pagination.Page[licenseschema.LicenseFamilyView]](t,
		call(t, "GET", "/api/license-families", nil), fiber.StatusOK)
	for _, family := range families.Items {
		if family.ID == plan.FamilyID {
			require.Equal(t, fiber.StatusOK, call(t, "PATCH", "/api/license-families/"+family.Slug, map[string]any{"isPublic": true}).StatusCode)
		}
	}
	monthly := commonfixture.AssertJSONResponse[prices.Price](t, call(t, "POST", "/api/licenses/"+plan.Slug+"/prices", map[string]any{
		"billingModel": "FLAT_FEE", "billingPeriod": "MONTHLY", "currency": "EUR", "unitAmountDecimal": "2900", "isDefault": true,
	}), fiber.StatusCreated)
	require.Equal(t, fiber.StatusCreated, call(t, "POST", "/api/publishable-keys",
		map[string]any{"label": "Storefront", "allowedOrigins": []string{storefront}}).StatusCode)
	customer := commonfixture.AssertJSONResponse[customerschema.Customer](t,
		call(t, "POST", "/api/customers", map[string]any{"name": "acme", "billingEmail": "ap@acme.test"}), fiber.StatusCreated)
	instance := commonfixture.AssertJSONResponse[instanceschema.Instance](t, call(t, "POST", "/api/instances", map[string]any{
		"name": "Acme prod", "description": "d", "customerId": customer.ID, "licenseId": plan.ID,
		"startLicenseDate": time.Now().UTC().Add(-24 * time.Hour), "endLicenseDate": time.Now().UTC().AddDate(1, 0, 0),
		"metadata": map[string]any{},
	}), fiber.StatusCreated)
	session := commonfixture.AssertJSONResponse[createcustomersession.CreatedCustomerSession](t, call(t, "POST", "/api/customer-sessions",
		map[string]any{"customerSlug": customer.Slug, "instanceSlug": instance.Slug}), fiber.StatusCreated)
	return shop{plan: plan, monthly: monthly, customer: customer, instance: instance, token: session.Token}
}

// asCustomer calls a session route from the customer's browser.
func asCustomer(t *testing.T, s shop, method, path string, payload any) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, method, path, payload)
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Origin", storefront)
	resp, err := testServer.App.Test(req, fiber.TestConfig{Timeout: 60 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

func checkout(t *testing.T, s shop, order map[string]any, status int) createsessioncheckout.SessionCheckout {
	t.Helper()
	return commonfixture.AssertJSONResponse[createsessioncheckout.SessionCheckout](t, asCustomer(t, s, "POST", checkoutPath, order), status)
}

// saveCardOnPage has the customer save a card on the setup page a checkout
// answered, and makes charging it do outcome.
func saveCardOnPage(t *testing.T, setupSessionID, outcome string) {
	t.Helper()
	pm := fake.CompleteSetupSession(stripefake.DefaultAccount, setupSessionID, "visa", "4242", 12, 2030)
	fake.SetCardOutcome(stripefake.DefaultAccount, pm, outcome)
}

func sessionInvoices(t *testing.T, s shop) []sessions.SessionInvoice {
	t.Helper()
	return commonfixture.AssertJSONResponse[pagination.Page[sessions.SessionInvoice]](t,
		asCustomer(t, s, "GET", "/api/public/session/invoices", nil), fiber.StatusOK).Items
}

// TestCheckoutCapturesACardThenCharges: the whole self-serve path. A preview,
// a setup page because the customer has no card, the second call that
// verifies the page server-side, subscribes and charges -- before answering.
func TestCheckoutCapturesACardThenCharges(t *testing.T) {
	fresh(t)
	s := newShop(t, nil)
	order := map[string]any{"licensePriceId": s.monthly.ID}

	preview := checkout(t, s, map[string]any{"licensePriceId": s.monthly.ID, "dryRun": true}, fiber.StatusOK)
	require.Equal(t, createsessioncheckout.StatusPreview, preview.Status)
	require.EqualValues(t, 2900, preview.DueToday.Total)
	require.Len(t, preview.DueToday.Lines, 1)
	require.Equal(t, "BASE", preview.DueToday.Lines[0].Type)
	require.Empty(t, fake.CallsOf(stripefake.OpCreateCustomer), "a preview reaches nothing outside the database")

	missing := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, asCustomer(t, s, "POST", checkoutPath, order), fiber.StatusUnprocessableEntity)
	require.Equal(t, "CreateSessionCheckout.InvalidReturnUrl", missing.Code, "a card is needed, so a return URL is")

	setup := checkout(t, s, map[string]any{"licensePriceId": s.monthly.ID, "returnUrl": returnURL}, fiber.StatusOK)
	require.Equal(t, createsessioncheckout.StatusRequiresPaymentMethod, setup.Status)
	require.NotEmpty(t, *setup.SetupURL)
	require.NotEmpty(t, *setup.SetupSessionID)

	incomplete := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, asCustomer(t, s, "POST", checkoutPath,
		map[string]any{"licensePriceId": s.monthly.ID, "setupSessionId": *setup.SetupSessionID}), fiber.StatusConflict)
	require.Equal(t, "CreateSessionCheckout.SetupSessionIncomplete", incomplete.Code, "the page was not finished")

	saveCardOnPage(t, *setup.SetupSessionID, stripefake.CardSucceeds)
	done := checkout(t, s, map[string]any{"licensePriceId": s.monthly.ID, "setupSessionId": *setup.SetupSessionID}, fiber.StatusCreated)
	require.Equal(t, createsessioncheckout.StatusSubscribed, done.Status)
	require.Equal(t, "ACTIVE", done.Subscription.Status)
	require.Equal(t, "STRIPE", done.Subscription.ProviderKind)
	require.Equal(t, "CHARGE_AUTOMATICALLY", done.Subscription.CollectionMethod)
	require.Equal(t, createsessioncheckout.PaymentPaid, done.Payment.Status, "charged inline, before the answer")
	require.Equal(t, "PAID", done.ActivationInvoice.Status)
	require.EqualValues(t, 2900, done.ActivationInvoice.Total)
	require.Len(t, fake.CallsOf(stripefake.OpPayInvoice), 1)

	listed := sessionInvoices(t, s)
	require.Len(t, listed, 1)
	require.Equal(t, done.ActivationInvoice.ID, listed[0].ID)
	require.Equal(t, "PAID", listed[0].Status)

	again := commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, asCustomer(t, s, "POST", checkoutPath, order), fiber.StatusConflict)
	require.Equal(t, "CreateSessionCheckout.AlreadySubscribed", again.Code)
}

// TestCheckoutRequiresAction: a card that needs 3-D Secure. The checkout
// subscribes and answers requires_action with the page to confirm on; once
// the customer has paid there, the invoice list learns it from Stripe.
func TestCheckoutRequiresAction(t *testing.T) {
	fresh(t)
	s := newShop(t, nil)
	setup := checkout(t, s, map[string]any{"licensePriceId": s.monthly.ID, "returnUrl": returnURL}, fiber.StatusOK)
	saveCardOnPage(t, *setup.SetupSessionID, stripefake.CardAuthenticationRequire)

	done := checkout(t, s, map[string]any{"licensePriceId": s.monthly.ID, "setupSessionId": *setup.SetupSessionID}, fiber.StatusCreated)
	require.Equal(t, createsessioncheckout.PaymentRequiresAction, done.Payment.Status)
	require.NotNil(t, done.Payment.HostedInvoiceURL)
	require.Equal(t, "ACTIVE", done.Subscription.Status, "within the auto-collection grace")

	// The customer confirms on the hosted page. Rule 10: the next poll reads
	// an invoice not read from Stripe for 30 seconds.
	invoice := invoice(t, mustUUID(t, done.ActivationInvoice.ID))
	fake.Pay(stripefake.DefaultAccount, deref(invoice.Provider.ExternalInvoiceID))
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE instance_invoice SET synced_at = synced_at - interval '1 minute' WHERE id = $1`, invoice.ID)
	require.NoError(t, err)
	listed := sessionInvoices(t, s)
	require.Len(t, listed, 1)
	require.Equal(t, "PAID", listed[0].Status)
}

// TestCheckoutTrialWithoutCard: nothing due today and no card required: the
// customer subscribes without one (rule 4).
func TestCheckoutTrialWithoutCard(t *testing.T) {
	fresh(t)
	s := newShop(t, map[string]any{"trialPeriodDays": 14})

	preview := checkout(t, s, map[string]any{"licensePriceId": s.monthly.ID, "dryRun": true}, fiber.StatusOK)
	require.EqualValues(t, 0, preview.DueToday.Total)
	require.Empty(t, preview.DueToday.Lines)
	require.NotNil(t, preview.TrialEndsAt)

	done := checkout(t, s, map[string]any{"licensePriceId": s.monthly.ID}, fiber.StatusCreated)
	require.Equal(t, "TRIAL", done.Subscription.Status)
	require.Equal(t, "CHARGE_AUTOMATICALLY", done.Subscription.CollectionMethod)
	require.Nil(t, done.ActivationInvoice)
	require.Equal(t, createsessioncheckout.PaymentNotRequired, done.Payment.Status)
	require.Empty(t, fake.CallsOf(stripefake.OpPayInvoice))
}

// TestCheckoutCardRequiredByThePlan: a plan that requires a payment method
// asks for one even with nothing due today.
func TestCheckoutCardRequiredByThePlan(t *testing.T) {
	fresh(t)
	s := newShop(t, map[string]any{"trialPeriodDays": 14, "requiresPaymentMethod": true})
	setup := checkout(t, s, map[string]any{"licensePriceId": s.monthly.ID, "returnUrl": returnURL}, fiber.StatusOK)
	require.Equal(t, createsessioncheckout.StatusRequiresPaymentMethod, setup.Status)

	saveCardOnPage(t, *setup.SetupSessionID, stripefake.CardSucceeds)
	done := checkout(t, s, map[string]any{"licensePriceId": s.monthly.ID, "setupSessionId": *setup.SetupSessionID}, fiber.StatusCreated)
	require.Equal(t, "TRIAL", done.Subscription.Status)
	require.Equal(t, "ACTIVE", customerBilling(t, sold{customer: s.customer}).Providers[0].PaymentMethod.Status)
}

func mustUUID(t *testing.T, raw string) uuid.UUID {
	t.Helper()
	id, err := uuid.Parse(raw)
	require.NoError(t, err)
	return id
}
