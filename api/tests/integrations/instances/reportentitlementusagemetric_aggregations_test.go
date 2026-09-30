package instances_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func newPeriodicEntitlementWithAggregation(t *testing.T, aggregationMethod entitlementschema.AggregationMethod) *entitlementschema.Entitlement {
	t.Helper()
	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	slug, err := slugutil.GenerateUnique("test-periodic-" + string(aggregationMethod))
	require.NoError(t, err)

	monthly := period.Month
	calendar := period.Calendar
	entitlement, err := repo.CreateEntitlement(t.Context(), createentitlement.CreateEntitlementInput{
		Name:              "Test periodic " + string(aggregationMethod),
		Slug:              slug,
		Type:              entitlementschema.Number,
		AggregationMethod: &aggregationMethod,
		ResetPeriod:       &monthly,
		ResetAnchor:       &calendar,
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	return entitlement
}

// TestReportEntitlementUsageMetric_AggregationsResetOnRollover covers every
// supported aggregation method: after a stale row rolls over, the new
// window's aggregation must start fresh from {0,0} -- it must never fold
// the incoming report against the closed window's extrema/average/count.
func TestReportEntitlementUsageMetric_AggregationsResetOnRollover(t *testing.T) {
	currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
	require.NoError(t, err)
	staleStart := currentWindow.Start.AddDate(0, -1, 0)

	tests := []struct {
		name              string
		aggregationMethod entitlementschema.AggregationMethod
		staleValue        float64
		staleEventCount   int32
		reportedValue     float64
		wantValue         float64
		wantEventCount    int32
	}{
		{"COUNT starts fresh at 1", entitlementschema.Count, 40, 40, 1, 1, 1},
		{"AVERAGE starts fresh from the new value alone", entitlementschema.Average, 1000, 20, 50, 50, 1},
		{"MAX starts fresh, ignores the closed window's extremum", entitlementschema.Max, 9999, 5, 3, 3, 1},
		// MIN's fresh baseline is a literal 0 (see computeUpdatedUsage's
		// NewDefaultNumberUsageValue seed), same as a brand new entitlement's
		// first-ever report -- pre-existing behavior, not new to periodic
		// reset. min(0, 50) stays 0: this is what proves the closed window's
		// extremum (-100) did NOT carry over, not that MIN "worked" per se.
		{"MIN starts fresh from a 0 baseline, ignores the closed window's extremum", entitlementschema.Min, -100, 5, 50, 0, 1},
		{"SUM starts fresh, does not add to the closed window's total", entitlementschema.Sum, 777, 7, 10, 10, 1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

			instances := newInstances(t, 1)
			entitlement := newPeriodicEntitlementWithAggregation(t, tc.aggregationMethod)
			assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1_000_000)
			seedUsageRow(t, instances[0].Slug, entitlement.Slug, tc.staleValue, tc.staleEventCount, &staleStart)

			payload := map[string]any{
				"value":    map[string]any{"type": "number", "value": tc.reportedValue},
				"behavior": "append",
			}
			req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, resp.Body)
			require.Equal(t, fiber.StatusOK, resp.StatusCode)

			row := getUsageRow(t, instances[0].ID, entitlement.ID)
			actual, err := entitlementvalue.ParseNumberUsageValue(row.Value)
			require.NoError(t, err)
			require.Equal(t, tc.wantValue, actual.Value)
			require.Equal(t, tc.wantEventCount, actual.EventCount)
			require.True(t, row.PeriodStart.Time.Equal(currentWindow.Start))

			payloads := rolloverEvents(t)
			require.Len(t, payloads, 1)
			require.Equal(t, tc.staleValue, payloads[0].Value)
			require.Equal(t, tc.staleEventCount, payloads[0].EventCount)
		})
	}
}

// TestReportEntitlementUsageMetric_LatestIncompatibleWithResetPeriod pins the
// SQL-level defense-in-depth for the LATEST/reset_period incompatibility:
// application validation already rejects this combination (see
// TestCreateEntitlement_ResetPeriod/WhenLatestAggregationWithResetPeriod_Returns400),
// this proves the entitlement_reset_period_latest_check CHECK constraint
// rejects it too, independent of the application layer.
func TestReportEntitlementUsageMetric_LatestIncompatibleWithResetPeriod(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	slug, err := slugutil.GenerateUnique("test-sql-latest-check")
	require.NoError(t, err)

	// Bypasses application validation entirely: created without a reset
	// period first (LATEST is otherwise valid), then rely on a raw SQL
	// UPDATE to attempt the exact transition application validation forbids.
	entitlement, err := repo.CreateEntitlement(t.Context(), createentitlement.CreateEntitlementInput{
		Name:              "Test SQL latest check",
		Slug:              slug,
		Type:              entitlementschema.Number,
		AggregationMethod: ptr.To(entitlementschema.Latest),
	}, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	_, err = testServer.Dependencies.DB.Exec(
		t.Context(),
		`UPDATE entitlement SET reset_period = 'MONTH', reset_anchor = 'CALENDAR' WHERE id = $1`,
		entitlement.ID,
	)
	require.Error(t, err)
	require.Contains(t, err.Error(), "entitlement_reset_period_latest_check")
}
