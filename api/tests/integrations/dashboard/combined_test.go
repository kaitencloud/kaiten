package dashboard_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/dashboard/getsummary"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// The dashboard's meters are the counters that were reported on: a combined
// entitlement has none, and enforces nothing, so it is neither a meter nor a
// limit reached however far the sum reads above its limit.
func TestGetDashboardSummary_ACombinedEntitlementIsNotAMeter(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	instances := newInstances(t, 1)
	heavy, light := newEntitlement(t, 0), newEntitlement(t, 0)
	resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", entitlementschema.Entitlement{
		Name: "Total", Slug: "total", Type: ptr.To(entitlementschema.Number), UsageSource: ptr.To(entitlementschema.CombinedUsage),
		Sources: []entitlementschema.EntitlementSource{{EntitlementSlug: heavy.Slug, Weight: "3"}, {EntitlementSlug: light.Slug, Weight: "0.1"}},
	}), fiber.TestConfig{})
	require.NoError(t, err)
	commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusCreated, resp.StatusCode)
	grant(t, instances[0].LicenseSlug, heavy.Slug, 100, 100)
	grant(t, instances[0].LicenseSlug, light.Slug, 100, 0)
	reportUsage(t, instances[0].Slug, heavy.Slug, 150) // the sum reads 450 of 310

	summaryResp := getSummary(t, "")
	defer commonfixture.MustCloseBody(t, summaryResp.Body)
	summary := commonfixture.AssertJSONResponse[getsummary.DashboardSummary](t, summaryResp, fiber.StatusOK)

	require.Len(t, summary.Saturation, 1, "the one counter that was reported on")
	assert.Equal(t, heavy.Slug, summary.Saturation[0].EntitlementSlug)
	assert.EqualValues(t, 0, summary.Attention.LimitsReached.Count)
	assert.EqualValues(t, 0, summary.Attention.NearThreshold.Count)
	assert.Equal(t, getsummary.DashboardStandingCounts{Healthy: 1}, summary.Figures.Instances.ByStanding)
}
