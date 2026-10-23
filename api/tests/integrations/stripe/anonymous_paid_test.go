package stripe_test

import (
	"net/url"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	tier2 "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	tier2events "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

type storefrontPlan struct {
	plan    licenseschema.License
	starter licenseschema.License
	monthly prices.Price
	key     string
}

// newStorefront is a public PAID plan at 29.00 EUR a month whose family
// falls back to a FREE Starter, sold through Stripe from the storefront by
// an anonymous-checkout key. commercial is merged into the plan's licence.
func newStorefront(t *testing.T, commercial map[string]any) storefrontPlan {
	t.Helper()
	connect(t, nil)
	version := func(name, pricingType string, extra map[string]any) (licenseschema.License, string) {
		body := map[string]any{
			"name": name, "description": "d", "type": "PAID", "isDefault": true,
			"lifecycleState": licenseschema.Published, "pricingType": pricingType,
		}
		for k, v := range extra {
			body[k] = v
		}
		license := commonfixture.AssertJSONResponse[licenseschema.License](t, call(t, "POST", "/api/licenses", body), fiber.StatusCreated)
		families := commonfixture.AssertJSONResponse[pagination.Page[licenseschema.LicenseFamilyView]](t,
			call(t, "GET", "/api/license-families", nil), fiber.StatusOK)
		for _, family := range families.Items {
			if family.ID == license.FamilyID {
				return license, family.Slug
			}
		}
		t.Fatalf("no family listed for licence %s", license.Slug)
		return license, ""
	}
	starter, starterFamily := version("Starter", "FREE", nil)
	plan, planFamily := version("Pro", "PAID", commercial)
	require.Equal(t, fiber.StatusOK, call(t, "PATCH", "/api/license-families/"+planFamily, map[string]any{
		"isPublic": true, "fallbackLicenseFamilySlug": starterFamily,
	}).StatusCode)
	monthly := commonfixture.AssertJSONResponse[prices.Price](t, call(t, "POST", "/api/licenses/"+plan.Slug+"/prices", map[string]any{
		"billingModel": "FLAT_FEE", "billingPeriod": "MONTHLY", "currency": "EUR", "unitAmountDecimal": "2900", "isDefault": true,
	}), fiber.StatusCreated)
	key := commonfixture.AssertJSONResponse[keys.PublishableKeyCreated](t, call(t, "POST", "/api/publishable-keys", map[string]any{
		"label": "Pricing page", "allowedOrigins": []string{storefront},
		"anonymousCheckout": true, "turnstileSiteKey": "0x4AAAAAAAsite", "turnstileSecret": "turnstile-secret",
	}), fiber.StatusCreated)
	return storefrontPlan{plan: plan, starter: starter, monthly: monthly, key: key.Key}
}

func startAnonymous(t *testing.T, s storefrontPlan, email string) tier2.CheckoutSessionStart {
	t.Helper()
	return commonfixture.AssertJSONResponse[tier2.CheckoutSessionStart](t, anonymousCall(t, "POST", "/api/public/checkout-sessions", map[string]any{
		"turnstileToken": "token", "priceId": s.monthly.ID, "email": email, "returnUrl": returnURL,
	}, map[string]string{"X-Kaiten-Publishable-Key": s.key}), fiber.StatusCreated)
}

func confirmAnonymous(t *testing.T, opened tier2.CheckoutSessionStart) tier2.CheckoutConfirmation {
	t.Helper()
	return commonfixture.AssertJSONResponse[tier2.CheckoutConfirmation](t, anonymousCall(t, "POST",
		"/api/public/checkout-sessions/"+opened.SessionID.String()+"/confirm", nil,
		map[string]string{"Authorization": "Bearer " + *opened.Token}), fiber.StatusOK)
}

// setupSessionID is the Stripe session a setup URL of the fake names.
func setupSessionID(t *testing.T, confirmation tier2.CheckoutConfirmation) string {
	t.Helper()
	require.Equal(t, tier2.ConfirmRequiresPaymentMethod, confirmation.Status)
	require.NotNil(t, confirmation.SetupURL)
	return (*confirmation.SetupURL)[strings.LastIndex(*confirmation.SetupURL, "/")+1:]
}

// TestAnonymousCheckoutPaysThroughASetup: the paid path of Tier 2 (§12.9).
// The first confirm opens a setup page with no Stripe customer, asked again
// it answers the same page, and once the visitor saved a card the confirm
// completes: the customer, the instance on the free fallback, the
// customer_billing link adopting the customer Stripe created, an INCOMPLETE
// subscription whose ACTIVATION is charged inline -- and its payment
// completes the session, the instance moved to the plan bought.
func TestAnonymousCheckoutPaysThroughASetup(t *testing.T) {
	fresh(t)
	s := newStorefront(t, nil)
	opened := startAnonymous(t, s, "Founder@Startup.test")
	require.EqualValues(t, 2900, opened.DueToday.Total)
	require.True(t, opened.RequiresPaymentMethod)

	customersBefore := fake.Customers(stripefake.DefaultAccount)
	first := confirmAnonymous(t, opened)
	pageID := setupSessionID(t, first)
	require.Equal(t, tier2.StatusOpen, first.Session.Status)
	require.Equal(t, customersBefore, fake.Customers(stripefake.DefaultAccount), "no Stripe customer before the setup (INV-34)")
	stripeCustomer, email, form, ok := fake.SetupSessionOf(stripefake.DefaultAccount, pageID)
	require.True(t, ok)
	require.Empty(t, stripeCustomer)
	require.Equal(t, "Founder@Startup.test", email)
	require.Equal(t, "always", form.Get("customer_creation"))
	require.Empty(t, form.Get("customer_update[address]"))
	require.Equal(t, "true", form.Get("tax_id_collection[enabled]"))
	require.Equal(t, opened.SessionID.String(), form.Get("metadata[kaiten_checkout_session_id]"))
	success, err := url.Parse(form.Get("success_url"))
	require.NoError(t, err)
	require.Equal(t, opened.SessionID.String(), success.Query().Get("kaiten_checkout_session"))
	create := fake.CallsOf(stripefake.OpCreateCheckoutSession)
	require.Equal(t, testDb.DefaultData.OrganizationID.String()+":checkout:"+opened.SessionID.String()+":setup", create[len(create)-1].IdempotencyKey)

	again := confirmAnonymous(t, opened)
	require.Equal(t, pageID, setupSessionID(t, again), "the open page is answered again")
	require.Len(t, fake.CallsOf(stripefake.OpCreateCheckoutSession), len(create))

	fake.CompleteSetupSession(stripefake.DefaultAccount, pageID, "visa", "4242", 12, 2030)
	done := confirmAnonymous(t, opened)
	require.Equal(t, tier2.ConfirmCompleted, done.Status, "charged inline, the payment completed the session")
	require.Equal(t, tier2.StatusCompleted, done.Session.Status)
	require.NotNil(t, done.Session.Payment)
	require.Equal(t, "paid", done.Session.Payment.Status)
	require.NotNil(t, done.Session.ActivationInvoice)
	require.EqualValues(t, 2900, done.Session.ActivationInvoice.Total)
	require.NotNil(t, done.Session.CustomerSlug)
	require.NotNil(t, done.Session.InstanceSlug)
	require.Equal(t, 1, outboxCount(t, tier2events.CheckoutSessionCompleted.Name))
	require.Equal(t, 1, outboxCount(t, "INSTANCE_UPDATED"), "the move at PAID is announced")

	instance := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", "/api/instances/"+*done.Session.InstanceSlug, nil), fiber.StatusOK)
	require.Equal(t, s.plan.ID.String(), instance["licenseId"], "moved from the fallback at PAID")
	sub := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", "/api/instances/"+*done.Session.InstanceSlug+"/billing", nil), fiber.StatusOK)
	require.Equal(t, "ACTIVE", sub["status"])
	require.Equal(t, "CHARGE_AUTOMATICALLY", sub["collectionMethod"])

	// The customer_billing link adopted the customer Checkout created, which
	// now carries the Kaiten ids; no second Stripe customer was made.
	adopted, _, _, _ := fake.SetupSessionOf(stripefake.DefaultAccount, pageID)
	require.NotEmpty(t, adopted)
	require.Equal(t, customersBefore+1, fake.Customers(stripefake.DefaultAccount))
	billing := commonfixture.AssertJSONResponse[map[string]any](t,
		call(t, "GET", "/api/customers/"+*done.Session.CustomerSlug+"/billing", nil), fiber.StatusOK)
	providers := billing["providers"].([]any)
	require.Len(t, providers, 1)
	link := providers[0].(map[string]any)
	require.Equal(t, adopted, link["externalCustomerId"])
	require.Equal(t, "ACTIVE", link["paymentMethod"].(map[string]any)["status"])
	_, metadata, _ := fake.CustomerOf(stripefake.DefaultAccount, adopted)
	require.Equal(t, opened.SessionID.String(), metadata["kaiten_checkout_session_id"])
	require.NotEmpty(t, metadata["kaiten_customer_id"])

	closed := commonfixture.AssertJSONResponse[map[string]any](t, anonymousCall(t, "POST",
		"/api/public/checkout-sessions/"+opened.SessionID.String()+"/confirm", nil,
		map[string]string{"Authorization": "Bearer " + *opened.Token}), fiber.StatusConflict)
	require.Equal(t, "ConfirmCheckoutSession.SessionClosed", closed["code"])
}

// TestAnonymousCheckoutReplacesAnExpiredPage: a setup page Stripe expired
// while the checkout session is still open is replaced, under the key of the
// page it replaces.
func TestAnonymousCheckoutReplacesAnExpiredPage(t *testing.T) {
	fresh(t)
	s := newStorefront(t, nil)
	opened := startAnonymous(t, s, "late@startup.test")
	expired := setupSessionID(t, confirmAnonymous(t, opened))
	fake.ExpireSetupSession(stripefake.DefaultAccount, expired)

	replacement := setupSessionID(t, confirmAnonymous(t, opened))
	require.NotEqual(t, expired, replacement)
	create := fake.CallsOf(stripefake.OpCreateCheckoutSession)
	require.True(t, strings.HasSuffix(create[len(create)-1].IdempotencyKey, ":setup:r:"+expired))
}

// TestAnonymousCheckoutDeclinedThenCanceled: a declined charge leaves the
// session AWAITING_PAYMENT, the instance on the free fallback; canceling the
// INCOMPLETE subscription ends the session EXPIRED, announced as abandoned,
// with the customer and the instance left for the vendor (§9.12 rule 5).
func TestAnonymousCheckoutDeclinedThenCanceled(t *testing.T) {
	fresh(t)
	s := newStorefront(t, nil)
	opened := startAnonymous(t, s, "broke@startup.test")
	pageID := setupSessionID(t, confirmAnonymous(t, opened))
	pm := fake.CompleteSetupSession(stripefake.DefaultAccount, pageID, "visa", "0002", 12, 2030)
	fake.SetCardOutcome(stripefake.DefaultAccount, pm, stripefake.CardDeclined)

	waiting := confirmAnonymous(t, opened)
	require.Equal(t, tier2.ConfirmAwaitingPayment, waiting.Status)
	require.Equal(t, tier2.StatusAwaitingPayment, waiting.Session.Status)
	require.Equal(t, "failed", waiting.Session.Payment.Status)
	require.Equal(t, 0, outboxCount(t, tier2events.CheckoutSessionCompleted.Name))
	instancePath := "/api/instances/" + *waiting.Session.InstanceSlug
	instance := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", instancePath, nil), fiber.StatusOK)
	require.Equal(t, s.starter.ID.String(), instance["licenseId"], "on the free fallback until paid")
	sub := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", instancePath+"/billing", nil), fiber.StatusOK)
	require.Equal(t, "INCOMPLETE", sub["status"])

	require.Equal(t, tier2.ConfirmAwaitingPayment, confirmAnonymous(t, opened).Status, "a confirm while waiting answers the session")

	canceled := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", instancePath+"/billing/cancel",
		map[string]any{"mode": "IMMEDIATE"}), fiber.StatusOK)
	require.Equal(t, "CANCELED", canceled["status"])
	read := commonfixture.AssertJSONResponse[tier2.CheckoutSession](t, anonymousCall(t, "GET",
		"/api/public/checkout-sessions/"+opened.SessionID.String(), nil,
		map[string]string{"Authorization": "Bearer " + *opened.Token}), fiber.StatusOK)
	require.Equal(t, tier2.StatusExpired, read.Status)
	require.Equal(t, 1, outboxCount(t, tier2events.CheckoutSessionAbandoned.Name))
	instance = commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", instancePath, nil), fiber.StatusOK)
	require.Equal(t, s.starter.ID.String(), instance["licenseId"], "the instance stays on the fallback")
}

// TestAnonymousCheckoutTrialWithCard: a trial on a plan that requires a
// payment method (KbK Growth, V32-08) captures the card first, then starts
// the trial: COMPLETED at the completion, on the plan bought, nothing
// charged before trial_ends_at.
func TestAnonymousCheckoutTrialWithCard(t *testing.T) {
	fresh(t)
	s := newStorefront(t, map[string]any{"trialPeriodDays": 14, "requiresPaymentMethod": true})
	opened := startAnonymous(t, s, "trial@startup.test")
	require.EqualValues(t, 0, opened.DueToday.Total)
	require.True(t, opened.RequiresPaymentMethod)
	require.NotNil(t, opened.TrialEndsAt)

	pageID := setupSessionID(t, confirmAnonymous(t, opened))
	fake.CompleteSetupSession(stripefake.DefaultAccount, pageID, "visa", "4242", 12, 2030)
	done := confirmAnonymous(t, opened)
	require.Equal(t, tier2.ConfirmCompleted, done.Status)
	require.Equal(t, tier2.StatusCompleted, done.Session.Status)
	require.Equal(t, 1, outboxCount(t, tier2events.CheckoutSessionCompleted.Name))

	instancePath := "/api/instances/" + *done.Session.InstanceSlug
	instance := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", instancePath, nil), fiber.StatusOK)
	require.Equal(t, s.plan.ID.String(), instance["licenseId"], "nothing due: on the plan from its creation")
	sub := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", instancePath+"/billing", nil), fiber.StatusOK)
	require.Equal(t, "TRIAL", sub["status"])
	require.Empty(t, fake.CallsOf(stripefake.OpPayInvoice), "nothing charged before trial_ends_at")
	billing := commonfixture.AssertJSONResponse[map[string]any](t,
		call(t, "GET", "/api/customers/"+*done.Session.CustomerSlug+"/billing", nil), fiber.StatusOK)
	link := billing["providers"].([]any)[0].(map[string]any)
	require.Equal(t, "ACTIVE", link["paymentMethod"].(map[string]any)["status"], "the trial's card is the default")
}
