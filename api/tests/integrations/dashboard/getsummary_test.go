package dashboard_test

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/dashboard/getsummary"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
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

func getSummaryFrom(t *testing.T, server *tests.TestServer, query string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/dashboard/summary"+query, nil)
	resp, err := server.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	return resp
}

func getSummary(t *testing.T, query string) *http.Response {
	t.Helper()
	return getSummaryFrom(t, testServer, query)
}

func meterOf(t *testing.T, meters []getsummary.DashboardMeter, instanceSlug, entitlementSlug string) getsummary.DashboardMeter {
	t.Helper()
	for _, m := range meters {
		if m.InstanceSlug == instanceSlug && m.EntitlementSlug == entitlementSlug {
			return m
		}
	}
	require.FailNowf(t, "meter not found", "%s/%s among %d meters", instanceSlug, entitlementSlug, len(meters))
	return getsummary.DashboardMeter{}
}

func rowOf(t *testing.T, rows []getsummary.DashboardInstanceReports, instanceSlug string) getsummary.DashboardInstanceReports {
	t.Helper()
	for _, row := range rows {
		if row.InstanceSlug == instanceSlug {
			return row
		}
	}
	require.FailNowf(t, "instance row not found", "%s among %d rows", instanceSlug, len(rows))
	return getsummary.DashboardInstanceReports{}
}

func TestGetDashboardSummary(t *testing.T) {
	t.Run("WhenTheOrganizationHasActivity_ReturnsWhatNeedsAttentionAndTheFigures", func(t *testing.T) {
		// Arrange: three instances of one customer on one license. The first
		// used all of a hard-limited grant and had a report refused since; the
		// second is above the warning threshold of another grant and read a
		// value; the third never reported but had a report refused.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 3)
		capped := newEntitlement(t, 80)
		watched := newEntitlement(t, 80)
		grant(t, instances[0].LicenseSlug, capped.Slug, 10, 0)
		grant(t, instances[0].LicenseSlug, watched.Slug, 100, 0)
		reportUsage(t, instances[0].Slug, capped.Slug, 10)
		reportUsage(t, instances[1].Slug, watched.Slug, 85)
		newAuditTrailEntry(t, instances[0].Slug, "ENTITLEMENT_USAGE_REPORT_REJECTED")
		newAuditTrailEntry(t, instances[1].Slug, "ENTITLEMENT_VALUE_GET")
		newAuditTrailEntry(t, instances[2].Slug, "ENTITLEMENT_USAGE_REPORT_REJECTED")

		// Act
		resp := getSummary(t, "?range=7d")
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		summary := commonfixture.AssertJSONResponse[getsummary.DashboardSummary](t, resp, fiber.StatusOK)
		require.Equal(t, getsummary.Range7Days, summary.Range.Range)
		require.Equal(t, 7, summary.Range.Days)

		require.EqualValues(t, 1, summary.Figures.Customers.Total)
		require.EqualValues(t, 1, summary.Figures.Customers.CreatedInRange)
		require.EqualValues(t, 3, summary.Figures.Instances.Total)
		require.EqualValues(t, 3, summary.Figures.Instances.ActiveInRange, "a refused report is activity")
		require.EqualValues(t, 0, summary.Figures.Instances.SilentInRange)
		require.EqualValues(t, 2, summary.Figures.UsageReports.Rejected24h)
		require.GreaterOrEqual(t, summary.Figures.UsageReports.Accepted, int64(2))
		require.Equal(t, getsummary.DashboardStandingCounts{AtLimit: 1, Watch: 1, Healthy: 1}, summary.Figures.Instances.ByStanding)

		require.EqualValues(t, 1, summary.Attention.LimitsReached.Count)
		require.Len(t, summary.Attention.LimitsReached.Items, 1)
		atLimit := summary.Attention.LimitsReached.Items[0]
		require.Equal(t, instances[0].Slug, atLimit.InstanceSlug)
		require.Equal(t, capped.Slug, atLimit.EntitlementSlug)
		require.True(t, atLimit.LimitReached)
		require.True(t, atLimit.HardLimit)
		require.EqualValues(t, 10, atLimit.Used)
		require.NotNil(t, atLimit.MaxAllowed)
		require.EqualValues(t, 10, *atLimit.MaxAllowed)
		require.Nil(t, atLimit.WindowStart, "a lifetime entitlement has no window")

		require.EqualValues(t, 1, summary.Attention.NearThreshold.Count)
		require.Len(t, summary.Attention.NearThreshold.Items, 1)
		near := summary.Attention.NearThreshold.Items[0]
		require.Equal(t, instances[1].Slug, near.InstanceSlug)
		require.Equal(t, watched.Slug, near.EntitlementSlug)
		require.True(t, near.AboveWarning)
		require.False(t, near.LimitReached)
		require.NotNil(t, near.Ratio)
		require.InDelta(t, 0.85, *near.Ratio, 0.001)

		require.EqualValues(t, 2, summary.Attention.RejectedReports24h.Count)
		require.Len(t, summary.Attention.RejectedReports24h.Items, 2)
		require.EqualValues(t, 0, summary.Attention.SilentInstances.Count)
		require.EqualValues(t, 0, summary.Attention.LicensesEnding30d.Count)
		require.Contains(t, summary.Attention.Checked, "limitsReached")
		require.Contains(t, summary.Attention.Checked, "rejectedReports24h")
		require.Contains(t, summary.Attention.Checked, "tokensExpiring30d")

		require.Len(t, summary.Saturation, 2)
		require.Equal(t, capped.Slug, summary.Saturation[0].EntitlementSlug, "the meter closest to its limit comes first")

		require.Len(t, summary.UsageReports.PerDay, 7)
		require.Len(t, summary.UsageReports.ByInstance, 3)
		first := rowOf(t, summary.UsageReports.ByInstance, instances[0].Slug)
		require.GreaterOrEqual(t, first.Accepted, int64(1))
		require.EqualValues(t, 1, first.Rejected24h)
		require.NotNil(t, first.LastReportAt)
		require.False(t, first.Silent)
		require.Equal(t, "atLimit", first.Standing)
		require.NotNil(t, first.Headline)
		require.Equal(t, capped.Slug, first.Headline.EntitlementSlug)
		second := rowOf(t, summary.UsageReports.ByInstance, instances[1].Slug)
		require.NotNil(t, second.LastReadAt)
		require.False(t, second.Silent)
		require.Equal(t, "watch", second.Standing)
		third := rowOf(t, summary.UsageReports.ByInstance, instances[2].Slug)
		require.False(t, third.Silent, "an instance whose reports are refused is talking, and blocked")
		require.Equal(t, "healthy", third.Standing)
		require.Nil(t, third.Headline)

		require.Len(t, summary.Licenses.Mix, 1)
		require.EqualValues(t, 3, summary.Licenses.Mix[0].Instances)
		require.Len(t, summary.Licenses.Mix[0].Versions, 1)
		require.EqualValues(t, 3, summary.Licenses.Mix[0].Versions[0].Instances)
		require.EqualValues(t, 0, summary.Licenses.Ending.Within180Days)
		require.Empty(t, summary.Licenses.Archived)

		require.NotNil(t, summary.Integrations)
		require.NotNil(t, summary.Integrations.Tokens)
		require.NotNil(t, summary.Integrations.PublishableKeys)
		require.NotNil(t, summary.Integrations.Connectors)
		require.NotNil(t, summary.Billing)
	})

	t.Run("WhenAnAllowanceIsUsedUp_TheMeterIsAtItsLimit", func(t *testing.T) {
		// A soft limit at its maximum refuses the next report as a hard one
		// does: it belongs with the limits reached, not with the warnings.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		metered := newEntitlement(t, 80)
		grant(t, instances[0].LicenseSlug, metered.Slug, 100, 20)
		reportUsage(t, instances[0].Slug, metered.Slug, 120)

		resp := getSummary(t, "")
		defer commonfixture.MustCloseBody(t, resp.Body)

		summary := commonfixture.AssertJSONResponse[getsummary.DashboardSummary](t, resp, fiber.StatusOK)
		require.EqualValues(t, 1, summary.Attention.LimitsReached.Count)
		require.EqualValues(t, 0, summary.Attention.NearThreshold.Count)
		m := summary.Attention.LimitsReached.Items[0]
		require.True(t, m.LimitReached)
		require.False(t, m.HardLimit)
		require.EqualValues(t, 120, *m.MaxAllowed)
		require.Equal(t, "atLimit", rowOf(t, summary.UsageReports.ByInstance, instances[0].Slug).Standing)
		require.EqualValues(t, 1, summary.Figures.Instances.ByStanding.AtLimit)
	})

	t.Run("TheWarningIsTheReportPaths", func(t *testing.T) {
		// No threshold, no warning: a grant left at the default never reads as
		// near its limit. With one, it fires on a percentage of the grant, not
		// of the grant plus its allowance, as the report path warns.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 2)
		silentDefault := newEntitlement(t, 0)
		warned := newEntitlement(t, 80)
		grant(t, instances[0].LicenseSlug, silentDefault.Slug, 100, 0)
		grant(t, instances[0].LicenseSlug, warned.Slug, 100, 50)
		reportUsage(t, instances[0].Slug, silentDefault.Slug, 90)
		reportUsage(t, instances[1].Slug, warned.Slug, 85)

		resp := getSummary(t, "")
		defer commonfixture.MustCloseBody(t, resp.Body)

		summary := commonfixture.AssertJSONResponse[getsummary.DashboardSummary](t, resp, fiber.StatusOK)
		quiet := meterOf(t, summary.Saturation, instances[0].Slug, silentDefault.Slug)
		require.False(t, quiet.AboveWarning)
		require.Equal(t, 0, quiet.WarningThresholdPercent)
		loud := meterOf(t, summary.Saturation, instances[1].Slug, warned.Slug)
		require.True(t, loud.AboveWarning, "85 of a grant of 100 is past 80 %, whatever the allowance")
		require.False(t, loud.LimitReached)
		require.EqualValues(t, 150, *loud.MaxAllowed)
		require.EqualValues(t, 1, summary.Attention.NearThreshold.Count)
		require.Equal(t, instances[1].Slug, summary.Attention.NearThreshold.Items[0].InstanceSlug)
	})

	t.Run("AClosedWindowReadsAsTheCurrentOne_Empty", func(t *testing.T) {
		// A monthly meter that hit its limit last month and sent nothing since
		// keeps its stored value, as rollover is lazy. The dashboard reads the
		// current window, as the usage endpoints do: 0, and not at its limit.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		monthly := newPeriodicEntitlement(t, 0)
		grant(t, instances[0].LicenseSlug, monthly.Slug, 10, 0)
		reportUsage(t, instances[0].Slug, monthly.Slug, 10)
		closeUsageWindow(t, instances[0].Slug, monthly.Slug)

		resp := getSummary(t, "")
		defer commonfixture.MustCloseBody(t, resp.Body)

		summary := commonfixture.AssertJSONResponse[getsummary.DashboardSummary](t, resp, fiber.StatusOK)
		m := meterOf(t, summary.Saturation, instances[0].Slug, monthly.Slug)
		require.EqualValues(t, 0, m.Used)
		require.False(t, m.LimitReached)
		require.EqualValues(t, 0, summary.Attention.LimitsReached.Count)
		require.NotNil(t, m.WindowStart)
		now := time.Now().UTC()
		require.Equal(t, time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC), m.WindowStart.UTC(), "the current calendar month")
		require.Equal(t, "healthy", rowOf(t, summary.UsageReports.ByInstance, instances[0].Slug).Standing)
	})

	t.Run("WhatTheCallerCannotRead_IsAbsent", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		_, err := testServer.Dependencies.DB.Exec(t.Context(),
			`UPDATE instance SET end_license_date = $1 WHERE id = $2`,
			time.Now().UTC().AddDate(0, 0, 10), instances[0].ID)
		require.NoError(t, err)

		t.Run("the three scopes of the home, alone", func(t *testing.T) {
			server := scopedServer(t,
				scope.Read(scope.Customers), scope.Read(scope.Instances), scope.Read(scope.Licenses))
			resp := getSummaryFrom(t, server, "")
			defer commonfixture.MustCloseBody(t, resp.Body)

			summary := commonfixture.AssertJSONResponse[getsummary.DashboardSummary](t, resp, fiber.StatusOK)
			require.Nil(t, summary.Billing)
			require.Nil(t, summary.Integrations)
			require.Nil(t, summary.FeatureFlags)
			require.Empty(t, summary.Zones)
			require.NotContains(t, summary.Attention.Checked, "tokensExpiring30d")
			require.NotContains(t, summary.Attention.Checked, "zonesBehind")
			require.Len(t, summary.Licenses.Ending.Items, 1, "licenses are part of the home")
			require.Nil(t, summary.Licenses.Ending.Items[0].BillingStatus, "a subscription status is billing's")
			require.False(t, summary.Licenses.Ending.Items[0].CancelAtPeriodEnd)
		})

		t.Run("tokens without publishable keys", func(t *testing.T) {
			server := scopedServer(t,
				scope.Read(scope.Customers), scope.Read(scope.Instances), scope.Read(scope.Licenses),
				scope.Read(scope.Tokens))
			resp := getSummaryFrom(t, server, "")
			defer commonfixture.MustCloseBody(t, resp.Body)

			summary := commonfixture.AssertJSONResponse[getsummary.DashboardSummary](t, resp, fiber.StatusOK)
			require.NotNil(t, summary.Integrations)
			require.NotNil(t, summary.Integrations.Tokens)
			require.Nil(t, summary.Integrations.PublishableKeys)
			require.Nil(t, summary.Integrations.Connectors)
			require.Contains(t, summary.Attention.Checked, "tokensExpiring30d")
		})

		t.Run("without read:licenses, refused", func(t *testing.T) {
			server := scopedServer(t, scope.Read(scope.Customers), scope.Read(scope.Instances))
			resp := getSummaryFrom(t, server, "")
			defer commonfixture.MustCloseBody(t, resp.Body)

			require.Equal(t, fiber.StatusForbidden, resp.StatusCode)
		})
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
		require.Equal(t, getsummary.DashboardStandingCounts{}, summary.Figures.Instances.ByStanding)
		require.Empty(t, summary.Saturation)
		require.Empty(t, summary.UsageReports.ByInstance)
		require.Len(t, summary.UsageReports.PerDay, 30, "one entry a day, zero-filled")
		for _, day := range summary.UsageReports.PerDay {
			require.EqualValues(t, 0, day.Accepted)
			require.EqualValues(t, 0, day.Rejected)
		}
		require.EqualValues(t, 0, summary.Attention.LimitsReached.Count)
		require.NotEmpty(t, summary.Attention.Checked, "the checks ran, and found nothing")
		require.Empty(t, summary.Licenses.Mix)
	})

	t.Run("WhenTheRangeIsNotOneOfThree_Refuses", func(t *testing.T) {
		resp := getSummary(t, "?range=5d")
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})
}
