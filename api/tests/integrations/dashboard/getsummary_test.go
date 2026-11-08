package dashboard_test

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/dashboard/getsummary"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// reportUsage sends a usage report the way an SDK does, and expects it accepted.
func reportUsage(t *testing.T, instanceSlug, entitlementSlug string, value int) {
	t.Helper()
	req := httptest.NewRequest(
		http.MethodPost,
		"/api/instances/"+instanceSlug+"/entitlements/"+entitlementSlug+"/usage",
		strings.NewReader(`{"value":{"type":"number","value":`+strconv.Itoa(value)+`},"behavior":"append"}`),
	)
	req.Header.Set("Content-Type", "application/json")
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusOK, resp.StatusCode)
}

func getSummary(t *testing.T, query string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/dashboard/summary"+query, nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	return resp
}

func TestGetDashboardSummary(t *testing.T) {
	t.Run("WhenTheOrganizationHasActivity_ReturnsWhatNeedsAttentionAndTheFigures", func(t *testing.T) {
		// Arrange: two instances of one customer on one license. The first
		// used all of a hard-limited grant and had a report refused since;
		// the second is above the warning threshold of another grant and
		// read a value.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 2)
		capped := newEntitlement(t, 80)
		watched := newEntitlement(t, 80)
		grant(t, instances[0].LicenseSlug, capped.Slug, 10, 0)
		grant(t, instances[0].LicenseSlug, watched.Slug, 100, 0)
		reportUsage(t, instances[0].Slug, capped.Slug, 10)
		reportUsage(t, instances[1].Slug, watched.Slug, 85)
		newAuditTrailEntry(t, instances[0].Slug, "ENTITLEMENT_USAGE_REPORT_REJECTED")
		newAuditTrailEntry(t, instances[1].Slug, "ENTITLEMENT_VALUE_GET")

		// Act
		resp := getSummary(t, "?range=7d")
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		summary := commonfixture.AssertJSONResponse[getsummary.DashboardSummary](t, resp, fiber.StatusOK)
		require.Equal(t, getsummary.Range7Days, summary.Range.Range)
		require.Equal(t, 7, summary.Range.Days)

		require.EqualValues(t, 1, summary.Figures.Customers.Total)
		require.EqualValues(t, 1, summary.Figures.Customers.CreatedInRange)
		require.EqualValues(t, 2, summary.Figures.Instances.Total)
		require.EqualValues(t, 2, summary.Figures.Instances.ActiveInRange)
		require.EqualValues(t, 0, summary.Figures.Instances.SilentInRange)
		require.EqualValues(t, 1, summary.Figures.UsageReports.Rejected24h)
		require.GreaterOrEqual(t, summary.Figures.UsageReports.Accepted, int64(2))

		require.EqualValues(t, 1, summary.Attention.HardLimits.Count)
		require.Len(t, summary.Attention.HardLimits.Items, 1)
		atLimit := summary.Attention.HardLimits.Items[0]
		require.Equal(t, instances[0].Slug, atLimit.InstanceSlug)
		require.Equal(t, capped.Slug, atLimit.EntitlementSlug)
		require.True(t, atLimit.LimitReached)
		require.True(t, atLimit.HardLimit)
		require.EqualValues(t, 10, atLimit.Used)
		require.NotNil(t, atLimit.MaxAllowed)
		require.EqualValues(t, 10, *atLimit.MaxAllowed)

		require.EqualValues(t, 1, summary.Attention.NearThreshold.Count)
		require.Len(t, summary.Attention.NearThreshold.Items, 1)
		near := summary.Attention.NearThreshold.Items[0]
		require.Equal(t, instances[1].Slug, near.InstanceSlug)
		require.Equal(t, watched.Slug, near.EntitlementSlug)
		require.True(t, near.AboveWarning)
		require.False(t, near.LimitReached)
		require.NotNil(t, near.Ratio)
		require.InDelta(t, 0.85, *near.Ratio, 0.001)

		require.EqualValues(t, 1, summary.Attention.RejectedReports24h.Count)
		require.Len(t, summary.Attention.RejectedReports24h.Items, 1)
		require.Equal(t, instances[0].Slug, summary.Attention.RejectedReports24h.Items[0].InstanceSlug)
		require.EqualValues(t, 0, summary.Attention.SilentInstances.Count)
		require.EqualValues(t, 0, summary.Attention.LicensesEnding30d.Count)
		require.Contains(t, summary.Attention.Checked, "hardLimits")
		require.Contains(t, summary.Attention.Checked, "rejectedReports24h")

		require.Len(t, summary.Saturation, 2)
		require.Equal(t, capped.Slug, summary.Saturation[0].EntitlementSlug, "the meter closest to its limit comes first")

		require.Len(t, summary.UsageReports.PerDay, 7)
		require.Len(t, summary.UsageReports.ByInstance, 2)
		byInstance := map[string]getsummary.DashboardInstanceReports{}
		for _, row := range summary.UsageReports.ByInstance {
			byInstance[row.InstanceSlug] = row
		}
		first := byInstance[instances[0].Slug]
		require.GreaterOrEqual(t, first.Accepted, int64(1))
		require.EqualValues(t, 1, first.Rejected24h)
		require.NotNil(t, first.LastReportAt)
		require.False(t, first.Silent)
		second := byInstance[instances[1].Slug]
		require.NotNil(t, second.LastReadAt)
		require.False(t, second.Silent)

		require.NotNil(t, summary.Licenses)
		require.Len(t, summary.Licenses.Mix, 1)
		require.EqualValues(t, 2, summary.Licenses.Mix[0].Instances)
		require.Len(t, summary.Licenses.Mix[0].Versions, 1)
		require.EqualValues(t, 2, summary.Licenses.Mix[0].Versions[0].Instances)
		require.EqualValues(t, 0, summary.Licenses.Ending.Within180Days)
		require.Empty(t, summary.Licenses.Archived)
	})

	t.Run("WhenTheOrganizationIsNew_EveryBlockIsEmpty", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		resp := getSummary(t, "")
		defer commonfixture.MustCloseBody(t, resp.Body)

		summary := commonfixture.AssertJSONResponse[getsummary.DashboardSummary](t, resp, fiber.StatusOK)
		require.Equal(t, getsummary.Range30Days, summary.Range.Range, "30d unless the request says")
		require.Equal(t, 30, summary.Range.Days)
		require.EqualValues(t, 0, summary.Figures.Customers.Total)
		require.EqualValues(t, 0, summary.Figures.Instances.Total)
		require.Empty(t, summary.Saturation)
		require.Empty(t, summary.UsageReports.ByInstance)
		require.Len(t, summary.UsageReports.PerDay, 30, "one entry a day, zero-filled")
		for _, day := range summary.UsageReports.PerDay {
			require.EqualValues(t, 0, day.Accepted)
			require.EqualValues(t, 0, day.Rejected)
		}
		require.EqualValues(t, 0, summary.Attention.HardLimits.Count)
		require.NotEmpty(t, summary.Attention.Checked, "the checks ran, and found nothing")
		require.NotNil(t, summary.Licenses)
		require.Empty(t, summary.Licenses.Mix)
	})

	t.Run("WhenTheRangeIsNotOneOfThree_Refuses", func(t *testing.T) {
		resp := getSummary(t, "?range=5d")
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})
}
