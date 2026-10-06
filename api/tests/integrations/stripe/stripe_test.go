package stripe_test

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/stripe/stripefake"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/getbillingcapabilities"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func capabilities(t *testing.T) getbillingcapabilities.BillingProvider {
	t.Helper()
	all := commonfixture.AssertJSONResponse[getbillingcapabilities.BillingCapabilities](t,
		call(t, "GET", "/api/billing/capabilities", nil), fiber.StatusOK)
	require.Len(t, all.Providers, 2)
	require.Equal(t, "STRIPE", all.Providers[1].Kind)
	return all.Providers[1]
}

// S09-002, S09-012: connect, probe, Vault, connected event, redacted read.
func TestConnect(t *testing.T) {
	fresh(t)

	stored := connect(t, nil)
	require.Equal(t, connector, stored["connector_name"])
	require.Equal(t, "***", stored["settings"].(map[string]any)["stripeSecretKey"])

	probes := fake.CallsOf(stripefake.OpListCustomers)
	require.Len(t, probes, 1, "one read-only probe")
	require.Equal(t, "Bearer "+testKey, probes[0].Authorization)
	require.Len(t, fake.Calls(), 1, "and no write")
	require.Equal(t, 1, outboxCount(t, "BILLING_PROVIDER_CONNECTED"))

	stripe := capabilities(t)
	require.True(t, stripe.Available)
	require.True(t, stripe.Connected)
	require.NotNil(t, stripe.Livemode)
	require.False(t, *stripe.Livemode)

	// A second save, and an explicit activation, are no transition.
	connect(t, map[string]any{"autoFinalize": false})
	require.Less(t, call(t, "PUT", "/api/connectors/"+connector+"/activation", nil).StatusCode, 300)
	require.Equal(t, 1, outboxCount(t, "BILLING_PROVIDER_CONNECTED"), "connected once per transition")

	var payload map[string]any
	for _, event := range commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID) {
		if event.EventName == "BILLING_PROVIDER_CONNECTED" {
			require.NoError(t, json.Unmarshal(event.Data, &payload))
		}
		require.NotContains(t, string(event.Data), testKey, "%s carries the key", event.EventName)
	}
	require.Equal(t, map[string]any{"providerKind": "STRIPE", "connectorName": connector, "livemode": false}, payload)
}

// S09-003, S09-004: malformed settings never reach Stripe; a key Stripe
// refuses is never stored and never activates.
func TestRefusedSettings(t *testing.T) {
	fresh(t)

	for _, settings := range []map[string]any{
		{"stripeSecretKey": "sk_test_abc"},
		{"stripeSecretKey": "rk_test_A1", "taxBehavior": "exclusive"},
		{"stripeSecretKey": "rk_test_A1", "webhookSecret": "whsec_1"},
	} {
		got := problem(t, fiber.StatusBadRequest, "PUT", "/api/connectors/"+connector+"/settings", map[string]any{"settings": settings})
		require.Equal(t, "UpdateConnectorSettings.InvalidPayloadSchema", got.Code)
	}
	require.Empty(t, fake.Calls(), "nothing reached Stripe")

	fake.RejectKey("rk_test_Bad1", http.StatusUnauthorized, "invalid_request_error", "api_key_expired", "Expired API Key provided: rk_test_Bad1")
	resp := call(t, "PUT", "/api/connectors/"+connector+"/settings", map[string]any{"settings": map[string]any{"stripeSecretKey": "rk_test_Bad1"}})
	body, _ := io.ReadAll(resp.Body)
	require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode, string(body))
	require.Contains(t, string(body), "UpdateConnectorSettings.CredentialsRejected")
	require.Contains(t, string(body), "credentials_rejected")
	require.NotContains(t, string(body), "rk_test_Bad1", "Stripe's message, which echoes the key, is scrubbed")

	require.False(t, capabilities(t).Connected, "no activation was written")
	require.Equal(t, 0, outboxCount(t, "BILLING_PROVIDER_CONNECTED"))
	require.Equal(t, fiber.StatusNotFound, call(t, "GET", "/api/connectors/"+connector+"/settings", nil).StatusCode, "nothing stored")

	fake.Partition(true)
	got := problem(t, fiber.StatusServiceUnavailable, "PUT", "/api/connectors/"+connector+"/settings",
		map[string]any{"settings": map[string]any{"stripeSecretKey": testKey}})
	require.Equal(t, "UpdateConnectorSettings.ProviderUnavailable", got.Code)
	fake.Partition(false)
}

// S09-006: while customers are mapped, a key of another account is refused.
func TestAccountChange(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	subscribe(t, s) // maps the customer in Stripe

	fake.SetAccount("rk_test_Other1", "acct_other")
	got := problem(t, fiber.StatusConflict, "PUT", "/api/connectors/"+connector+"/settings",
		map[string]any{"settings": map[string]any{"stripeSecretKey": "rk_test_Other1"}})
	require.Equal(t, "UpdateConnectorSettings.AccountChanged", got.Code)

	// Another key of the same account is fine; options alone never re-check.
	connect(t, map[string]any{"stripeSecretKey": "rk_test_A2"})
	connect(t, map[string]any{"automaticTax": false})
}

// S09-007, S09-008: activation needs the entitlement and a Vault.
func TestGating(t *testing.T) {
	fresh(t)

	entitlements.deny(t, dogfooding.ConnectorStripeEntitlementSlug)
	got := problem(t, fiber.StatusForbidden, "PUT", "/api/connectors/"+connector+"/settings",
		map[string]any{"settings": map[string]any{"stripeSecretKey": testKey}})
	require.Equal(t, "ActivateConnector.NotEntitled", got.Code)
	require.Empty(t, fake.Calls(), "an organization that may not use Stripe never reaches it")
	stripe := capabilities(t)
	require.False(t, stripe.Available)
	require.Equal(t, "NOT_ENTITLED", *stripe.UnavailableReason)
}

func TestVaultRequired(t *testing.T) {
	fresh(t)
	t.Setenv("VAULT_FAKE_FILE_PATH", "")

	stripe := capabilities(t)
	require.False(t, stripe.Available)
	require.Equal(t, "VAULT_NOT_CONFIGURED", *stripe.UnavailableReason)
	require.Equal(t, "ActivateConnector.VaultNotConfigured",
		problem(t, fiber.StatusUnprocessableEntity, "PUT", "/api/connectors/"+connector+"/activation", nil).Code)
	require.Equal(t, "UpdateConnectorSettings.VaultNotConfigured",
		problem(t, fiber.StatusUnprocessableEntity, "PUT", "/api/connectors/"+connector+"/settings",
			map[string]any{"settings": map[string]any{"stripeSecretKey": testKey}}).Code)
	require.Empty(t, fake.Calls())
}

// S09-024, S09-025, S09-086: the ACTIVATION of a STRIPE subscription is
// pushed, finalized and reconciled.
func TestPushSendInvoice(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	started := subscribe(t, s)
	require.Equal(t, "STRIPE", started.ProviderKind)
	require.NotNil(t, started.ActivationInvoice)

	pushed := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool {
		return i.Status == "PUSHED" && i.Provider != nil && i.Provider.ReconciliationStatus != nil
	}, "the ACTIVATION is pushed and reconciled")
	require.Equal(t, "MATCHED", *pushed.Provider.ReconciliationStatus)
	require.NotEmpty(t, deref(pushed.Provider.HostedInvoiceURL))

	externalID := deref(pushed.Provider.ExternalInvoiceID)
	require.Equal(t, []string{externalID}, fake.Invoices(stripefake.DefaultAccount, started.ActivationInvoice.ID.String()),
		"exactly one Stripe invoice")
	status, items, _ := fake.Invoice(stripefake.DefaultAccount, externalID)
	require.Equal(t, "open", status)
	require.Equal(t, 1, items)

	draft := fake.CallsOf(stripefake.OpCreateInvoice)[0]
	require.Equal(t, started.ActivationInvoice.ID.String()+":draft", draft.IdempotencyKey)
	require.Equal(t, "eur", draft.Form.Get("currency"))
	require.Equal(t, "send_invoice", draft.Form.Get("collection_method"))
	require.Equal(t, "30", draft.Form.Get("days_until_due"))
	require.Equal(t, "exclude", draft.Form.Get("pending_invoice_items_behavior"))
	require.Equal(t, "ACTIVATION", draft.Form.Get("metadata[kind]"))
	item := fake.CallsOf(stripefake.OpCreateItem)[0]
	require.Equal(t, "2900", item.Form.Get("amount"))
	require.Equal(t, "exclusive", item.Form.Get("tax_behavior"))
	customer := fake.CallsOf(stripefake.OpCreateCustomer)[0]
	require.Equal(t, "ap@acme.test", customer.Form.Get("email"))
	require.Equal(t, s.customer.ID.String(), customer.Form.Get("metadata[kaiten_customer_id]"))

	for _, c := range fake.Calls() {
		require.Equal(t, "Bearer "+testKey, c.Authorization)
	}
}

// S09-045: review mode leaves the draft in Stripe; retry-push finalizes it.
func TestReviewMode(t *testing.T) {
	fresh(t)
	connect(t, map[string]any{"stripeSecretKey": testKey, "autoFinalize": false})
	started := subscribe(t, newSold(t, "acme"))

	waiting := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool {
		return i.Provider != nil && deref(i.Provider.ExternalInvoiceID) != "" && deref(i.Provider.Status) == "draft"
	}, "the draft waits for review")
	require.Equal(t, "DRAFT", waiting.Status)
	require.Equal(t, 0, fake.Count(stripefake.OpFinalizeInvoice))

	require.Equal(t, fiber.StatusAccepted, call(t, "POST", "/api/invoices/"+started.ActivationInvoice.ID.String()+"/retry-push", nil).StatusCode)
	waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PUSHED" }, "retry-push finalizes it")
	require.Equal(t, 1, fake.Count(stripefake.OpFinalizeInvoice))
}

// S09-058: a draft whose answer was lost is replayed under its key: still one
// Stripe invoice.
func TestLostDraftAnswer(t *testing.T) {
	fresh(t)
	connect(t, nil)
	fake.DropResponse(stripefake.OpCreateInvoice)
	started := subscribe(t, newSold(t, "acme"))

	waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PUSHED" }, "pushed after the retry")
	require.Len(t, fake.Invoices(stripefake.DefaultAccount, started.ActivationInvoice.ID.String()), 1)
	require.GreaterOrEqual(t, fake.Count(stripefake.OpCreateInvoice), 2)
}

// S09-049: Stripe down: PUSH_FAILED, then pushed once it answers.
func TestStripeDown(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	started := subscribe(t, s) // creates the Stripe customer at once
	fake.Partition(true)

	failed := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PUSH_FAILED" }, "Stripe down")
	require.Contains(t, deref(failed.Provider.LastPushError), "UNAVAILABLE")
	require.NotContains(t, deref(failed.Provider.LastPushError), testKey)

	fake.Partition(false)
	pushed := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PUSHED" }, "pushed once Stripe answers")
	require.GreaterOrEqual(t, pushed.Provider.PushAttempts, int32(1))
	require.Len(t, fake.Invoices(stripefake.DefaultAccount, started.ActivationInvoice.ID.String()), 1)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// S09-072, S09-073, S09-081: a payment in Stripe reaches Kaiten through sync.
func TestSyncAPayment(t *testing.T) {
	fresh(t)
	connect(t, nil)
	started := subscribe(t, newSold(t, "acme"))
	pushed := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PUSHED" }, "pushed")

	fake.Pay(stripefake.DefaultAccount, deref(pushed.Provider.ExternalInvoiceID))
	require.Equal(t, fiber.StatusAccepted, call(t, "POST", "/api/billing/sync", nil).StatusCode)
	paid := invoice(t, started.ActivationInvoice.ID)
	require.Equal(t, "PAID", paid.Status)
	require.NotNil(t, paid.PaidAt)
	require.NotEmpty(t, fake.CallsOf(stripefake.OpListEvents))
}

// S09-093: void runs in Stripe first.
func TestVoid(t *testing.T) {
	fresh(t)
	connect(t, nil)
	started := subscribe(t, newSold(t, "acme"))
	pushed := waitFor(t, started.ActivationInvoice.ID, func(i invoices.Invoice) bool { return i.Status == "PUSHED" }, "pushed")

	voided := commonfixture.AssertJSONResponse[invoices.Invoice](t,
		call(t, "POST", "/api/invoices/"+started.ActivationInvoice.ID.String()+"/void", map[string]any{"reason": "wrong price"}), fiber.StatusOK)
	require.Equal(t, "VOID", voided.Status)
	status, _, _ := fake.Invoice(stripefake.DefaultAccount, deref(pushed.Provider.ExternalInvoiceID))
	require.Equal(t, "void", status)
	require.Equal(t, started.ActivationInvoice.ID.String()+":void", fake.CallsOf(stripefake.OpVoidInvoice)[0].IdempotencyKey)
}

// S09-010: no disconnect while billing routes to Stripe; then once.
func TestDisconnect(t *testing.T) {
	fresh(t)
	connect(t, nil)
	s := newSold(t, "acme")
	started := subscribe(t, s)

	for _, path := range []string{"/activation", "/settings"} {
		got := problem(t, fiber.StatusConflict, "DELETE", "/api/connectors/"+connector+path, nil)
		require.True(t, strings.HasSuffix(got.Code, ".BillingActive"), got.Code)
		require.Equal(t, map[string]any{"activeSubscriptions": float64(1), "openInvoices": float64(1)}, got.Errors[0].Value)
	}
	require.True(t, capabilities(t).Connected, "still connected")

	// Cancel the subscription and settle the invoice in the database: only the
	// guard is under test here.
	_, err := testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE instance_billing SET status = 'CANCELED', canceled_at = now() WHERE id = $1`, started.ID)
	require.NoError(t, err)
	_, err = testServer.Dependencies.DB.Exec(t.Context(),
		`UPDATE instance_invoice SET status = 'VOID', voided_at = now(), void_reason = 'test', next_push_at = NULL WHERE instance_billing_id = $1`, started.ID)
	require.NoError(t, err)

	require.Equal(t, fiber.StatusNoContent, call(t, "DELETE", "/api/connectors/"+connector+"/activation", nil).StatusCode)
	require.Equal(t, fiber.StatusNoContent, call(t, "DELETE", "/api/connectors/"+connector+"/activation", nil).StatusCode)
	require.Equal(t, 1, outboxCount(t, "BILLING_PROVIDER_DISCONNECTED"), "disconnected once")
	require.False(t, capabilities(t).Connected)
}
