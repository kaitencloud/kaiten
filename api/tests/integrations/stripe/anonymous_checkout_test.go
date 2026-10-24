package stripe_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	tier2 "github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/checkout"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// anonymousCall calls a Tier 2 route from the storefront.
func anonymousCall(t *testing.T, method, path string, body any, headers map[string]string) *http.Response {
	t.Helper()
	req := commonfixture.NewJSONRequest(t, method, path, body)
	req.Header.Set("Origin", storefront)
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := testServer.App.Test(req, fiber.TestConfig{Timeout: 60 * time.Second})
	require.NoError(t, err)
	t.Cleanup(func() { commonfixture.MustCloseBody(t, resp.Body) })
	return resp
}

// TestAnonymousCheckoutTrialWithoutCard: a PAID plan with a trial that needs
// no payment method completes at its first confirm, with no setup: TRIAL on
// STRIPE, charged automatically, nothing charged now (§9.12 rule 7). The
// subscribe joins the completion's transaction and makes no provider call in
// it (Δ32-1.8): the Stripe customer is created after the commit, and a
// failure there undoes nothing.
func TestAnonymousCheckoutTrialWithoutCard(t *testing.T) {
	fresh(t)
	connect(t, nil)
	plan := commonfixture.AssertJSONResponse[licenseschema.License](t, call(t, "POST", "/api/licenses", map[string]any{
		"name": "Growth", "description": "d", "type": "PAID", "isDefault": true,
		"lifecycleState": licenseschema.Published, "pricingType": "PAID", "trialPeriodDays": 14,
	}), fiber.StatusCreated)
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
	key := commonfixture.AssertJSONResponse[keys.PublishableKeyCreated](t, call(t, "POST", "/api/publishable-keys", map[string]any{
		"label": "Pricing page", "allowedOrigins": []string{storefront},
		"anonymousCheckout": true, "turnstileSiteKey": "0x4AAAAAAAsite", "turnstileSecret": "turnstile-secret",
	}), fiber.StatusCreated)

	opened := commonfixture.AssertJSONResponse[tier2.CheckoutSessionStart](t, anonymousCall(t, "POST", "/api/public/checkout-sessions", map[string]any{
		"turnstileToken": "token", "priceId": monthly.ID, "email": "founder@startup.test", "returnUrl": returnURL,
	}, map[string]string{"X-Kaiten-Publishable-Key": key.Key}), fiber.StatusCreated)
	require.EqualValues(t, 0, opened.DueToday.Total, "during a trial nothing is due")
	require.NotNil(t, opened.TrialEndsAt)
	require.False(t, opened.RequiresPaymentMethod)

	fake.Fail(stripefake.OpCreateCustomer, http.StatusInternalServerError, "api_error", "", 1)
	before := len(fake.CallsOf(stripefake.OpCreateCustomer))
	done := commonfixture.AssertJSONResponse[tier2.CheckoutConfirmation](t, anonymousCall(t, "POST",
		"/api/public/checkout-sessions/"+opened.SessionID.String()+"/confirm", nil,
		map[string]string{"Authorization": "Bearer " + *opened.Token}), fiber.StatusOK)
	require.Equal(t, tier2.ConfirmCompleted, done.Status, "the provider's failure after the commit undoes nothing")
	require.Len(t, fake.CallsOf(stripefake.OpCreateCustomer), before+1, "tried once, after the commit")

	billingPath := "/api/instances/" + *done.Session.InstanceSlug + "/billing"
	sub := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", billingPath, nil), fiber.StatusOK)
	require.Equal(t, "TRIAL", sub["status"])
	require.Equal(t, "STRIPE", sub["providerKind"])
	require.Equal(t, "CHARGE_AUTOMATICALLY", sub["collectionMethod"])
	require.Empty(t, fake.CallsOf(stripefake.OpPayInvoice), "nothing charged before trial_ends_at")

	// The new customer's billing e-mail is the one the visitor gave; its
	// provider customer is ensured again by the first call that needs it.
	customerBilling := commonfixture.AssertJSONResponse[map[string]any](t,
		call(t, "GET", "/api/customers/"+*done.Session.CustomerSlug+"/billing", nil), fiber.StatusOK)
	require.Equal(t, "founder@startup.test", customerBilling["billingEmail"])
}
