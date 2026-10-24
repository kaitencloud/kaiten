package billing_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// §19.3 (V31-03, V31-11): every |null member of the health section is present,
// null when there is nothing to report; the handoff counts the invoices claimed
// again, the cards expiring soon are counted, and the usage ledger reports the
// retention in force with its source, as the capabilities do.
func TestBillingHealthShape(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	health := func() map[string]any {
		t.Helper()
		return commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", "/api/billing/health", nil), fiber.StatusOK)
	}
	member := func(object map[string]any, name string) any {
		t.Helper()
		value, present := object[name]
		require.True(t, present, "%s is present (V31-03)", name)
		return value
	}

	empty := health()
	require.Nil(t, member(empty["closeBacklog"].(map[string]any), "oldestDueAt"))
	require.Nil(t, member(empty["pushFailures"].(map[string]any), "oldestFailedAt"))
	handoff := empty["handoff"].(map[string]any)
	require.Nil(t, member(handoff, "oldestPendingIssuedAt"))
	require.EqualValues(t, 0, member(handoff, "reclaimedLast24h"))
	require.EqualValues(t, 0, member(empty, "paymentMethodsExpiring30d"))
	ledger := member(empty, "usageLedger").(map[string]any)
	capabilities := commonfixture.AssertJSONResponse[map[string]any](t, call(t, "GET", "/api/billing/capabilities", nil), fiber.StatusOK)
	require.Equal(t, "ENV", ledger["retentionSource"], "no licensing authority: the deployment's setting")
	require.Nil(t, member(ledger, "retentionMonths"), "the test server keeps usage forever: null, with ENV")
	require.Equal(t, ledger["retentionSource"], capabilities["usageHistoryRetentionSource"], "the same pair (§18.4 rule 5)")
	require.Equal(t, ledger["retentionMonths"], capabilities["usageHistoryRetentionMonths"])
	for _, provider := range capabilities["providers"].([]any) {
		entry := provider.(map[string]any)
		if entry["kind"] == "NOOP" {
			require.Nil(t, member(entry, "unavailableReason"))
			require.Nil(t, member(entry, "livemode"), "NOOP has no live account")
		}
	}

	// A NoOp ACTIVATION waits in the handoff queue; claimed, its lease
	// expires, and it is claimed again.
	s := newSold(t, flatFee("2900", "MONTHLY"))
	started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	claim := func() {
		t.Helper()
		resp := call(t, "POST", "/api/billing/handoff/claim", map[string]any{"limit": 10, "leaseSeconds": 60})
		require.Equal(t, fiber.StatusOK, resp.StatusCode)
	}
	claim()
	require.EqualValues(t, 0, health()["handoff"].(map[string]any)["reclaimedLast24h"], "claimed once")
	exec(t, `UPDATE instance_invoice SET handoff_leased_until = now() - interval '1 minute' WHERE id = $1`, started.ActivationInvoice.ID)
	claim()
	require.EqualValues(t, 1, health()["handoff"].(map[string]any)["reclaimedLast24h"], "claimed again after its lease expired")
	resp := call(t, "POST", "/api/billing/handoff/"+started.ActivationInvoice.ID.String()+"/ack", map[string]any{"externalReference": "ERP-1"})
	require.Equal(t, fiber.StatusOK, resp.StatusCode)
	require.EqualValues(t, 1, health()["handoff"].(map[string]any)["reclaimedLast24h"], "acknowledged since, it was still claimed again today")
	exec(t, `UPDATE instance_invoice SET handoff_reclaimed_at = now() - interval '25 hours' WHERE id = $1`, started.ActivationInvoice.ID)
	require.EqualValues(t, 0, health()["handoff"].(map[string]any)["reclaimedLast24h"], "a day ago")

	// An ACTIVE card that expires at the end of this month, another next year.
	now := time.Now().UTC()
	for i, expiry := range []time.Time{now, now.AddDate(1, 0, 0)} {
		customer := newCustomer(t, []string{"initech", "globex"}[i])
		exec(t, `INSERT INTO customer_billing (customer_id, organization_id, provider_kind, external_customer_id,
		             default_payment_method_id, payment_method_status, payment_method_exp_month, payment_method_exp_year,
		             payment_method_attached_at)
		         SELECT $1, organization_id, 'STRIPE', 'cus_' || $2::text, 'pm_' || $2::text, 'ACTIVE', $3, $4, now()
		         FROM customer WHERE id = $1`,
			customer.ID, customer.Slug, int(expiry.Month()), expiry.Year())
	}
	// A card is usable through its expiry month: it stops working at the first
	// of the next one, which is within 30 days except early in a 31-day month.
	stops := time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.UTC)
	want := 0
	if !stops.After(now.Add(30 * 24 * time.Hour)) {
		want = 1
	}
	require.EqualValues(t, want, health()["paymentMethodsExpiring30d"], "the card of this month, never next year's")
}
