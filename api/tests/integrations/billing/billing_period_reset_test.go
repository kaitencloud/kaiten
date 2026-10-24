package billing_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	instanceschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestBillingPeriodWindows: a BILLING_PERIOD entitlement's windows follow the
// instance's live subscription, else its licence start, split where the last
// live subscription ended; each anchor change closes the stored window once,
// ANCHOR_CHANGED, at the instant of the change (§6.7, V32-04).
func TestBillingPeriodWindows(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	commonfixture.AssertJSONResponse[map[string]any](t, call(t, "POST", "/api/entitlements", map[string]any{
		"name": "API calls", "slug": "api-calls", "description": "d", "type": "NUMBER", "aggregationMethod": "SUM",
		"resetPeriod": "MONTH", "resetAnchor": "BILLING_PERIOD",
	}), fiber.StatusCreated)
	s := newSold(t, flatFee("2900", "MONTHLY"))
	grant(t, s.version.Slug, "api-calls", 10000, 0)
	path := "/api/instances/" + s.instance.Slug + "/entitlements/api-calls/usage"
	report := func(value float64) {
		t.Helper()
		resp := call(t, "POST", path, map[string]any{"value": map[string]any{"type": "number", "value": value}, "behavior": "append"})
		require.Less(t, resp.StatusCode, 300)
	}
	usage := func() instanceschema.EntitlementUsage {
		t.Helper()
		return commonfixture.AssertJSONResponse[instanceschema.EntitlementUsage](t, call(t, "GET", path, nil), fiber.StatusOK)
	}
	rolledOver := func() []map[string]any {
		t.Helper()
		return outboxPayloads(t, "INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER")
	}
	at := func(v any) time.Time {
		t.Helper()
		parsed, err := time.Parse(time.RFC3339Nano, v.(string))
		require.NoError(t, err)
		return parsed
	}

	// No subscription: the licence start's windows.
	report(400)
	licence := usage()
	require.NotNil(t, licence.CurrentPeriodStart)
	require.True(t, licence.CurrentPeriodStart.Equal(s.instance.StartLicenseDate.UTC().Truncate(time.Millisecond)),
		"the window starts at the licence start: %s, %s", licence.CurrentPeriodStart, s.instance.StartLicenseDate)

	// A trial is live: the windows run from its anchor, and every read shows
	// the new window at once, 0 used.
	subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID, "trialDays": 7})
	sub := readBilling(t, s.instance.Slug)
	trial := usage()
	require.True(t, trial.CurrentPeriodStart.Equal(sub.AnchorAt), "%s, %s", trial.CurrentPeriodStart, sub.AnchorAt)
	require.True(t, trial.CurrentPeriodEnd.Equal(sub.AnchorAt.AddDate(0, 1, 0)))
	require.NotNil(t, trial.Value.Number)
	require.InDelta(t, 0, trial.Value.Number.Value, 0)

	// The next report closes the stored window once, ANCHOR_CHANGED, at the
	// anchor.
	report(100)
	closures := rolledOver()
	require.Len(t, closures, 1)
	require.Equal(t, "ANCHOR_CHANGED", closures[0]["reason"])
	require.True(t, at(closures[0]["closed_period_start"]).Equal(*licence.CurrentPeriodStart))
	require.True(t, at(closures[0]["closed_period_end"]).Equal(sub.AnchorAt))
	require.EqualValues(t, 400, closures[0]["value"])
	require.InDelta(t, 100, usage().Value.Number.Value, 0)

	// The trial ends at once: the licence start's window that contains the
	// cancellation is split there.
	cancel(t, s.instance.Slug, map[string]any{"mode": "IMMEDIATE"})
	canceledAt := *readBilling(t, s.instance.Slug).CanceledAt
	after := usage()
	require.True(t, after.CurrentPeriodStart.Equal(canceledAt), "%s, %s", after.CurrentPeriodStart, canceledAt)
	require.True(t, after.CurrentPeriodEnd.Equal(licence.CurrentPeriodEnd.UTC()), "the licence start's next boundary")
	require.InDelta(t, 0, after.Value.Number.Value, 0)

	report(5)
	closures = rolledOver()
	require.Len(t, closures, 2)
	var second map[string]any
	for _, c := range closures {
		if c["value"] == float64(100) {
			second = c
		}
	}
	require.NotNil(t, second)
	require.Equal(t, "ANCHOR_CHANGED", second["reason"])
	require.True(t, at(second["closed_period_start"]).Equal(sub.AnchorAt))
	require.True(t, at(second["closed_period_end"]).Equal(canceledAt))
}
