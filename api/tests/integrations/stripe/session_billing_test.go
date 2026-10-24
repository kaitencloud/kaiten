package stripe_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/completepaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createportalsession"
	customerschema "github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/createcustomersession"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

const (
	paymentMethodSessionPath = "/api/public/session/billing/payment-method-session"
	portalSessionPath        = "/api/public/session/billing/portal-session"
)

func sessionProblem(t *testing.T, s shop, status int, method, path string, payload any) string {
	t.Helper()
	return commonfixture.AssertJSONResponse[kaitenerrors.Problem](t, asCustomer(t, s, method, path, payload), status).Code
}

// anotherCustomersSession is a session for another customer of the same
// organization, from the same storefront.
func anotherCustomersSession(t *testing.T, s shop) shop {
	t.Helper()
	other := commonfixture.AssertJSONResponse[customerschema.Customer](t,
		call(t, "POST", "/api/customers", map[string]any{"name": "globex", "billingEmail": "ap@globex.test"}), fiber.StatusCreated)
	session := commonfixture.AssertJSONResponse[createcustomersession.CreatedCustomerSession](t,
		call(t, "POST", "/api/customer-sessions", map[string]any{"customerSlug": other.Slug}), fiber.StatusCreated)
	s.customer, s.token = other, session.Token
	return s
}

// §14.4: a customer session saves a payment method on the provider's hosted
// page, completes it, and opens the provider's portal -- for its own customer
// only, returning only to the storefront's origins, with the Core refusals
// under the session operations' names.
func TestSessionPaymentMethodAndPortal(t *testing.T) {
	fresh(t)
	s := newShop(t, nil)

	// Not in Stripe yet: no portal to open.
	require.Equal(t, "CreateSessionPortalSession.CustomerNotOnProvider",
		sessionProblem(t, s, fiber.StatusUnprocessableEntity, "POST", portalSessionPath, map[string]any{"returnUrl": returnURL}))

	// The page returns to the storefront only.
	require.Equal(t, "CreateSessionPaymentMethodSession.InvalidReturnUrl",
		sessionProblem(t, s, fiber.StatusUnprocessableEntity, "POST", paymentMethodSessionPath,
			map[string]any{"returnUrl": "https://elsewhere.test/back", "currency": "EUR"}))
	// No live subscription: the currency is the session's to say.
	require.Equal(t, "CreateSessionPaymentMethodSession.CurrencyRequired",
		sessionProblem(t, s, fiber.StatusUnprocessableEntity, "POST", paymentMethodSessionPath, map[string]any{"returnUrl": returnURL}))

	opened := commonfixture.AssertJSONResponse[createpaymentmethodsession.PaymentMethodSession](t,
		asCustomer(t, s, "POST", paymentMethodSessionPath, map[string]any{"returnUrl": returnURL, "currency": "EUR"}), fiber.StatusOK)
	require.NotEmpty(t, opened.URL)
	require.NotEmpty(t, opened.SessionID)
	created := fake.CallsOf(stripefake.OpCreateCheckoutSession)
	require.Len(t, created, 1)
	require.Equal(t, "setup", created[0].Form.Get("mode"))
	require.Equal(t, s.customer.ID.String(), created[0].Form.Get("metadata[kaiten_customer_id]"), "how sync recognizes a session Kaiten created")
	require.Contains(t, created[0].Form.Get("success_url"), returnURL)

	completePath := paymentMethodSessionPath + "/" + opened.SessionID + "/complete"
	require.Equal(t, "CompleteSessionPaymentMethodSession.SessionNotComplete",
		sessionProblem(t, s, fiber.StatusConflict, "POST", completePath, nil), "the redirect is never trusted: the page was not completed")

	fake.CompleteSetupSession(stripefake.DefaultAccount, opened.SessionID, "visa", "4242", 12, 2030)
	// Another customer's session cannot complete this one's page.
	other := anotherCustomersSession(t, s)
	require.Equal(t, "CompleteSessionPaymentMethodSession.SessionNotFound",
		sessionProblem(t, other, fiber.StatusNotFound, "POST", completePath, nil))

	completed := commonfixture.AssertJSONResponse[completepaymentmethodsession.CompletedPaymentMethodSession](t,
		asCustomer(t, s, "POST", completePath, nil), fiber.StatusOK)
	require.Equal(t, "ACTIVE", completed.PaymentMethod.Status)
	require.Equal(t, "4242", *completed.PaymentMethod.Last4)
	again := commonfixture.AssertJSONResponse[completepaymentmethodsession.CompletedPaymentMethodSession](t,
		asCustomer(t, s, "POST", completePath, nil), fiber.StatusOK)
	require.Equal(t, completed.PaymentMethod, again.PaymentMethod, "safe to repeat")
	require.Equal(t, 1, outboxCount(t, "CUSTOMER_PAYMENT_METHOD_ATTACHED"), "announced once")

	// In Stripe now: the portal opens, and returns to the storefront only.
	portal := commonfixture.AssertJSONResponse[createportalsession.PortalSession](t,
		asCustomer(t, s, "POST", portalSessionPath, map[string]any{"returnUrl": returnURL}), fiber.StatusOK)
	require.NotEmpty(t, portal.URL)
	require.Equal(t, returnURL, fake.CallsOf(stripefake.OpCreatePortalSession)[0].Form.Get("return_url"))
	require.Equal(t, "CreateSessionPortalSession.InvalidReturnUrl",
		sessionProblem(t, s, fiber.StatusUnprocessableEntity, "POST", portalSessionPath, map[string]any{"returnUrl": "https://elsewhere.test/back"}))
}
