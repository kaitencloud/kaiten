package stripe_test

import (
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/completepaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createpaymentmethodsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/createportalsession"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getcustomerbilling"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/paymentmethods"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscribeinstance"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// openSession opens a setup page for the customer.
func openSession(t *testing.T, s sold) createpaymentmethodsession.PaymentMethodSession {
	t.Helper()
	return commonfixture.AssertJSONResponse[createpaymentmethodsession.PaymentMethodSession](t,
		call(t, "POST", "/api/customers/"+s.customer.Slug+"/billing/payment-method-session",
			map[string]any{"returnUrl": "https://app.acme.test/billing", "currency": "EUR"}), fiber.StatusOK)
}

// saveCard has the customer save a card on the hosted page, completes the
// session, and makes charging that card do outcome.
func saveCard(t *testing.T, s sold, outcome string) string {
	t.Helper()
	session := openSession(t, s)
	pm := fake.CompleteSetupSession(stripefake.DefaultAccount, session.SessionID, "visa", "4242", 12, 2030)
	fake.SetCardOutcome(stripefake.DefaultAccount, pm, outcome)
	commonfixture.AssertJSONResponse[completepaymentmethodsession.CompletedPaymentMethodSession](t,
		call(t, "POST", "/api/customers/"+s.customer.Slug+"/billing/payment-method-session/"+session.SessionID+"/complete", nil), fiber.StatusOK)
	return pm
}

func customerBilling(t *testing.T, s sold) getcustomerbilling.CustomerBilling {
	t.Helper()
	return commonfixture.AssertJSONResponse[getcustomerbilling.CustomerBilling](t,
		call(t, "GET", "/api/customers/"+s.customer.Slug+"/billing", nil), fiber.StatusOK)
}

func subscribeAutomatic(t *testing.T, s sold) subscribeinstance.StartedSubscription {
	t.Helper()
	return commonfixture.AssertJSONResponse[subscribeinstance.StartedSubscription](t,
		call(t, "POST", "/api/instances/"+s.instance.Slug+"/billing", map[string]any{
			"basePriceId": s.monthly.ID, "providerKind": "STRIPE", "collectionMethod": "CHARGE_AUTOMATICALLY",
		}), fiber.StatusCreated)
}

func billing(t *testing.T, s sold) subscriptions.InstanceBilling {
	t.Helper()
	return commonfixture.AssertJSONResponse[subscriptions.InstanceBilling](t,
		call(t, "GET", "/api/instances/"+s.instance.Slug+"/billing", nil), fiber.StatusOK)
}

// S09-103, S09-105, S09-128: a setup page, completed server-side, saves
// labels only.
func TestSaveAPaymentMethod(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")

	require.Equal(t, "CreatePaymentMethodSession.CurrencyRequired", problem(t, fiber.StatusUnprocessableEntity, "POST",
		"/api/customers/"+s.customer.Slug+"/billing/payment-method-session", map[string]any{"returnUrl": "https://app.acme.test/billing"}).Code)
	require.Equal(t, "CreatePaymentMethodSession.InvalidReturnUrl", problem(t, fiber.StatusUnprocessableEntity, "POST",
		"/api/customers/"+s.customer.Slug+"/billing/payment-method-session", map[string]any{"returnUrl": "http://app.acme.test", "currency": "EUR"}).Code)

	session := openSession(t, s)
	require.True(t, strings.HasPrefix(session.URL, "https://checkout.stripe.test/c/"))
	created := fake.CallsOf(stripefake.OpCreateCheckoutSession)[0]
	require.Equal(t, "setup", created.Form.Get("mode"))
	require.Equal(t, s.customer.ID.String(), created.Form.Get("metadata[kaiten_customer_id]"))

	complete := "/api/customers/" + s.customer.Slug + "/billing/payment-method-session/" + session.SessionID + "/complete"
	require.Equal(t, "CompletePaymentMethodSession.SessionNotComplete", problem(t, fiber.StatusConflict, "POST", complete, nil).Code)
	require.Equal(t, "CompletePaymentMethodSession.SessionNotFound",
		problem(t, fiber.StatusNotFound, "POST", "/api/customers/"+s.customer.Slug+"/billing/payment-method-session/cs_nope/complete", nil).Code)

	pm := fake.CompleteSetupSession(stripefake.DefaultAccount, session.SessionID, "visa", "4242", 12, 2030)
	done := commonfixture.AssertJSONResponse[completepaymentmethodsession.CompletedPaymentMethodSession](t, call(t, "POST", complete, nil), fiber.StatusOK)
	require.Equal(t, "ACTIVE", done.PaymentMethod.Status)
	require.Equal(t, "4242", *done.PaymentMethod.Last4)
	require.Equal(t, pm, fake.DefaultPaymentMethod(stripefake.DefaultAccount, customerOf(t)), "made the default in Stripe")

	again := commonfixture.AssertJSONResponse[completepaymentmethodsession.CompletedPaymentMethodSession](t, call(t, "POST", complete, nil), fiber.StatusOK)
	require.Equal(t, done.PaymentMethod, again.PaymentMethod)
	require.Equal(t, 1, outboxCount(t, "CUSTOMER_PAYMENT_METHOD_ATTACHED"), "attached once")

	view := customerBilling(t, s)
	require.Len(t, view.Providers, 1)
	require.Equal(t, "STRIPE", view.Providers[0].ProviderKind)
	require.Equal(t, "visa", *view.Providers[0].PaymentMethod.Brand)

	portal := commonfixture.AssertJSONResponse[createportalsession.PortalSession](t,
		call(t, "POST", "/api/customers/"+s.customer.Slug+"/billing/portal-session", map[string]any{"returnUrl": "https://app.acme.test/billing"}),
		fiber.StatusOK)
	require.True(t, strings.HasPrefix(portal.URL, "https://billing.stripe.test/p/"))
}

func customerOf(t *testing.T) string {
	t.Helper()
	calls := fake.CallsOf(stripefake.OpCreateCustomer)
	require.NotEmpty(t, calls)
	var id string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT external_customer_id FROM customer_billing ORDER BY created_at DESC LIMIT 1`).Scan(&id))
	return id
}

// S09-035: subscribed to be charged automatically, the ACTIVATION is charged
// off-session and PAID.
func TestChargedAutomatically(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")

	require.Equal(t, "SubscribeInstance.PaymentMethodRequired", problem(t, fiber.StatusUnprocessableEntity, "POST",
		"/api/instances/"+s.instance.Slug+"/billing", map[string]any{
			"basePriceId": s.monthly.ID, "providerKind": "STRIPE", "collectionMethod": "CHARGE_AUTOMATICALLY",
		}).Code)

	saveCard(t, s, stripefake.CardSucceeds)
	started := subscribeAutomatic(t, s)
	paid := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PAID" }, "charged")
	require.Equal(t, "CHARGE_AUTOMATICALLY", paid.CollectionMethod)
	require.Equal(t, "MATCHED", deref(waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool {
		return i.Provider != nil && i.Provider.ReconciliationStatus != nil
	}, "reconciled").Provider.ReconciliationStatus))

	draft := fake.CallsOf(stripefake.OpCreateInvoice)[0]
	require.Equal(t, "charge_automatically", draft.Form.Get("collection_method"))
	require.Empty(t, draft.Form.Get("days_until_due"))
	pay := fake.CallsOf(stripefake.OpPayInvoice)
	require.Len(t, pay, 1)
	require.Equal(t, started.ActivationInvoice.ID.String()+":pay", pay[0].IdempotencyKey)
	require.Equal(t, "true", pay[0].Form.Get("off_session"))
	require.Equal(t, "ACTIVE", billing(t, s).Status)
}

// S09-036: a declined card: PAYMENT_FAILED, and PAST_DUE at once.
func TestDeclinedCard(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	saveCard(t, s, stripefake.CardInsufficientFunds)
	started := subscribeAutomatic(t, s)

	failed := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PAYMENT_FAILED" }, "declined")
	_ = failed
	require.Equal(t, "PAST_DUE", billing(t, s).Status, "a refused charge is overdue at once")
	require.Equal(t, "FAILED", customerBilling(t, s).Providers[0].PaymentMethod.Status)
	require.Equal(t, 1, outboxCount(t, "INSTANCE_INVOICE_PAYMENT_FAILED"))

	// The customer pays on the hosted page: sync settles it, ACTIVE again.
	fake.SetCardOutcome(stripefake.DefaultAccount, fake.DefaultPaymentMethod(stripefake.DefaultAccount, customerOf(t)), stripefake.CardSucceeds)
	fake.Pay(stripefake.DefaultAccount, deref(failed.Provider.ExternalInvoiceID))
	require.Equal(t, fiber.StatusAccepted, call(t, "POST", "/api/billing/sync", nil).StatusCode)
	require.Equal(t, "PAID", invoice(t, started.ActivationInvoice.ID).Status)
	require.Equal(t, "ACTIVE", billing(t, s).Status)
}

// S09-038: 3-D Secure: PAYMENT_FAILED awaiting the customer, not overdue
// within the auto-collection grace.
func TestAuthenticationRequired(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	saveCard(t, s, stripefake.CardAuthenticationRequire)
	started := subscribeAutomatic(t, s)

	waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PAYMENT_FAILED" }, "awaiting authentication")
	require.Equal(t, "ACTIVE", billing(t, s).Status, "within the grace")
	require.Equal(t, "ACTIVE", customerBilling(t, s).Providers[0].PaymentMethod.Status, "the card is fine")

	var payload string
	require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
		`SELECT data::text FROM outbox_events WHERE event_name = 'INSTANCE_INVOICE_PAYMENT_FAILED'`).Scan(&payload))
	require.Contains(t, payload, `"requiresAction": true`)
	require.NotContains(t, payload, "4242", "no card data")
}

// S09-040: the charge's answer is lost: the invoice stays PUSHED, the charge
// is retried under the same key, and charged once.
func TestLostChargeAnswer(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	saveCard(t, s, stripefake.CardSucceeds)
	fake.DropResponse(stripefake.OpPayInvoice)
	started := subscribeAutomatic(t, s)

	waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PAID" }, "paid after the retry")
	pays := fake.CallsOf(stripefake.OpPayInvoice)
	require.GreaterOrEqual(t, len(pays), 2)
	for _, p := range pays {
		require.Equal(t, started.ActivationInvoice.ID.String()+":pay", p.IdempotencyKey, "one key whatever the attempts")
	}
}

// S09-108: detaching is refused while the customer is charged
// automatically; switching to SEND_INVOICE first allows it.
func TestDetach(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	saveCard(t, s, stripefake.CardSucceeds)
	started := subscribeAutomatic(t, s)
	waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PAID" }, "charged")

	detach := "/api/customers/" + s.customer.Slug + "/billing/payment-method"
	require.Equal(t, "DetachPaymentMethod.InUseByAutomaticCollection", problem(t, fiber.StatusConflict, "DELETE", detach, nil).Code)

	require.Less(t, call(t, "PATCH", "/api/instances/"+s.instance.Slug+"/billing", map[string]any{"collectionMethod": "SEND_INVOICE"}).StatusCode, 300)
	require.Equal(t, fiber.StatusNoContent, call(t, "DELETE", detach, nil).StatusCode)
	require.Nil(t, customerBilling(t, s).Providers[0].PaymentMethod)
	require.Equal(t, 1, outboxCount(t, "CUSTOMER_PAYMENT_METHOD_DETACHED"))
	require.Equal(t, "DetachPaymentMethod.NoPaymentMethod", problem(t, fiber.StatusConflict, "DELETE", detach, nil).Code)
	require.Equal(t, "UpdateInstanceBilling.PaymentMethodRequired", problem(t, fiber.StatusUnprocessableEntity, "PATCH",
		"/api/instances/"+s.instance.Slug+"/billing", map[string]any{"collectionMethod": "CHARGE_AUTOMATICALLY"}).Code)
}

// S09-082: a setup session nobody completed still converges, through sync.
func TestSyncAdoptsACompletedSession(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	session := openSession(t, s)
	fake.CompleteSetupSession(stripefake.DefaultAccount, session.SessionID, "mastercard", "5454", 3, 2031)

	require.Equal(t, fiber.StatusAccepted, call(t, "POST", "/api/billing/sync", nil).StatusCode)
	method := customerBilling(t, s).Providers[0].PaymentMethod
	require.NotNil(t, method, "adopted")
	require.Equal(t, "5454", *method.Last4)
	require.Equal(t, 1, outboxCount(t, "CUSTOMER_PAYMENT_METHOD_ATTACHED"))
}

// S09-109: announced once, 30 days before the end of the expiry month; then
// EXPIRED.
func TestExpiry(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	saveCard(t, s, stripefake.CardSucceeds)

	// A card expiring in December 2030 is announced on 1 December 2030:
	// 30 days before the 31st.
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE customer_billing SET payment_method_exp_month = 12, payment_method_exp_year = 2030`)
	require.NoError(t, err)
	expiry := paymentmethods.NewExpiry(uow.NewUnitOfWork(testDb.DbPool))
	before, err := expiry.PassAt(t.Context(), time.Date(2030, 11, 30, 9, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	require.Equal(t, 0, before)
	announced, err := expiry.PassAt(t.Context(), time.Date(2030, 12, 1, 0, 5, 0, 0, time.UTC))
	require.NoError(t, err)
	require.Equal(t, 1, announced)
	again, err := expiry.PassAt(t.Context(), time.Date(2030, 12, 1, 6, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	require.Equal(t, 0, again, "once a day")
}

func TestExpired(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	saveCard(t, s, stripefake.CardSucceeds)
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE customer_billing SET payment_method_exp_month = 1, payment_method_exp_year = 2020`)
	require.NoError(t, err)
	_, err = paymentmethods.NewExpiry(uow.NewUnitOfWork(testDb.DbPool)).Pass(t.Context())
	require.NoError(t, err)
	require.Equal(t, "EXPIRED", customerBilling(t, s).Providers[0].PaymentMethod.Status)
	require.Equal(t, 0, outboxCount(t, "CUSTOMER_PAYMENT_METHOD_EXPIRING"))
}
