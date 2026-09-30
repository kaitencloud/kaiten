package instances_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/createentitlement"
	entitlementsdb "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/reportentitlementusagemetric"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func newPeriodicEntitlement(t *testing.T, resetPeriod period.ResetPeriod, resetAnchor period.ResetAnchor) *entitlementschema.Entitlement {
	t.Helper()
	repo := createentitlement.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))

	description := "Test periodic entitlement"
	entitlementSlug, err := slugutil.GenerateUnique("test-periodic-entitlement")
	require.NoError(t, err)

	entitlement, err := repo.CreateEntitlement(
		t.Context(),
		createentitlement.CreateEntitlementInput{
			Name:              "Test Periodic Entitlement",
			Slug:              entitlementSlug,
			Description:       &description,
			Type:              entitlementschema.Number,
			AggregationMethod: ptr.To(entitlementschema.Sum),
			ResetPeriod:       &resetPeriod,
			ResetAnchor:       &resetAnchor,
		},
		testDb.DefaultData.OrganizationID,
	)
	require.NoError(t, err)

	return entitlement
}

// seedUsageRow directly writes an entitlement_usage row with an explicit
// period_start, bypassing the report endpoint entirely -- this is how these
// tests simulate a stale bucket deterministically (seed a row whose
// period_start is N windows in the past, then issue a real report and
// observe the rollover) without manipulating the database clock.
func seedUsageRow(t *testing.T, instanceSlug, entitlementSlug string, value float64, eventCount int32, periodStart *time.Time) {
	t.Helper()
	orgID := testDb.DefaultData.OrganizationID

	instance, err := instancedb.New(testServer.Dependencies.DB).GetOneInstance(t.Context(), instancedb.GetOneInstanceParams{
		OrganizationID: orgID,
		Slug:           instanceSlug,
	})
	require.NoError(t, err)

	entitlement, err := entitlementsdb.New(testServer.Dependencies.DB).GetEntitlement(t.Context(), entitlementsdb.GetEntitlementParams{
		OrganizationID: orgID,
		Slug:           entitlementSlug,
	})
	require.NoError(t, err)

	repo := reportentitlementusagemetric.NewCommandRepository(uow.NewUnitOfWork(testServer.Dependencies.DB))
	usageBytes, err := json.Marshal(entitlementvalue.NumberUsageValue{
		Type:       entitlementvalue.TypeNumber,
		Value:      value,
		EventCount: eventCount,
	})
	require.NoError(t, err)

	require.NoError(t, repo.ReportEntitlementUsage(t.Context(), instance.ID, entitlement.ID, usageBytes, orgID, periodStart))
}

func getUsageRow(t *testing.T, instanceID, entitlementID uuid.UUID) instancedb.GetEntitlementUsageForInstanceRow {
	t.Helper()
	row, err := instancedb.New(testServer.Dependencies.DB).GetEntitlementUsageForInstance(t.Context(), instancedb.GetEntitlementUsageForInstanceParams{
		InstanceID:     instanceID,
		EntitlementID:  entitlementID,
		OrganizationID: testDb.DefaultData.OrganizationID,
	})
	require.NoError(t, err)
	return row
}

func rolloverEvents(t *testing.T) []reportentitlementusagemetric.InstanceEntitlementUsagePeriodRolledOver {
	t.Helper()
	events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

	var payloads []reportentitlementusagemetric.InstanceEntitlementUsagePeriodRolledOver
	for _, event := range events {
		if event.EventName != instanceEvents.InstanceEntitlementUsagePeriodRolledOver.Name {
			continue
		}
		var payload reportentitlementusagemetric.InstanceEntitlementUsagePeriodRolledOver
		require.NoError(t, json.Unmarshal(event.Data, &payload))
		payloads = append(payloads, payload)
	}
	return payloads
}

func TestReportEntitlementUsageMetric_Periodic(t *testing.T) {
	t.Run("WhenFirstReport_SetsPeriodStartWithNoRollover", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		payload := map[string]any{"value": map[string]any{"type": "number", "value": 5}, "behavior": "append"}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)

		currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)

		row := getUsageRow(t, instances[0].ID, entitlement.ID)
		require.True(t, row.PeriodStart.Valid)
		require.True(t, row.PeriodStart.Time.Equal(currentWindow.Start), "period_start = %v, want %v", row.PeriodStart.Time, currentWindow.Start)

		require.Empty(t, rolloverEvents(t), "first-ever report must not emit a rollover event")
	})

	t.Run("WhenReportingWithinSameWindow_AccumulatesWithoutRollover", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		for _, v := range []int{5, 3} {
			payload := map[string]any{"value": map[string]any{"type": "number", "value": v}, "behavior": "append"}
			req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			commonfixture.MustCloseBody(t, resp.Body)
			require.Equal(t, fiber.StatusOK, resp.StatusCode)
		}

		row := getUsageRow(t, instances[0].ID, entitlement.ID)
		actual, err := entitlementvalue.ParseNumberUsageValue(row.Value)
		require.NoError(t, err)
		require.EqualValues(t, 8, actual.Value)
		require.EqualValues(t, 2, actual.EventCount)
		require.Empty(t, rolloverEvents(t), "reports within the same window must not roll over")
	})

	t.Run("WhenStoredRowIsOneWindowStale_RollsOverOnce", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		staleStart := currentWindow.Start.AddDate(0, -1, 0)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 200, 4, &staleStart)

		payload := map[string]any{"value": map[string]any{"type": "number", "value": 10}, "behavior": "append"}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		row := getUsageRow(t, instances[0].ID, entitlement.ID)
		actual, err := entitlementvalue.ParseNumberUsageValue(row.Value)
		require.NoError(t, err)
		require.EqualValues(t, 10, actual.Value, "the new window must start from 0, not accumulate the stale value")
		require.EqualValues(t, 1, actual.EventCount)
		require.True(t, row.PeriodStart.Time.Equal(currentWindow.Start))

		payloads := rolloverEvents(t)
		require.Len(t, payloads, 1)
		p := payloads[0]
		require.False(t, p.IsSynthetic)
		require.NotNil(t, p.ClosedPeriodStart)
		require.True(t, p.ClosedPeriodStart.Equal(staleStart))
		require.NotNil(t, p.ClosedPeriodEnd)
		require.True(t, p.ClosedPeriodEnd.Equal(currentWindow.Start))
		require.Equal(t, 200.0, p.Value)
		require.EqualValues(t, 4, p.EventCount)
		require.True(t, p.NewPeriodStart.Equal(currentWindow.Start))
		require.Equal(t, entitlement.ID, p.EntitlementID)
		require.Equal(t, instances[0].ID, p.InstanceID)
	})

	t.Run("WhenWindowsAreSkipped_MaterializesOneClosurePerWindow", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		staleStart := currentWindow.Start.AddDate(0, -3, 0)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 50, 1, &staleStart)

		payload := map[string]any{"value": map[string]any{"type": "number", "value": 1}, "behavior": "append"}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		payloads := rolloverEvents(t)
		require.Len(t, payloads, 3, "3 months skipped: 1 real + 2 synthetic empty closures")

		require.False(t, payloads[0].IsSynthetic)
		require.Equal(t, 50.0, payloads[0].Value)
		require.EqualValues(t, 1, payloads[0].EventCount)

		syntheticCount := 0
		for _, p := range payloads[1:] {
			if p.IsSynthetic {
				syntheticCount++
				require.Zero(t, p.Value)
				require.Zero(t, p.EventCount)
			}
		}
		require.Equal(t, 2, syntheticCount)

		// Contiguity chain across all closures.
		for i := range len(payloads) - 1 {
			require.True(t, payloads[i].NewPeriodStart.Equal(*payloads[i+1].ClosedPeriodStart),
				"closures[%d].NewPeriodStart must equal closures[%d].ClosedPeriodStart", i, i+1)
		}
		require.True(t, payloads[len(payloads)-1].NewPeriodStart.Equal(currentWindow.Start))
	})

	t.Run("WhenLifetimeBucketAdoptsPeriodicReset_ClosesWithNullBounds", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t) // lifetime: no reset_period
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 42)

		enablePayload := map[string]any{
			"name":              entitlement.Name,
			"description":       "",
			"aggregationMethod": "SUM",
			"resetPeriod":       "MONTH",
			"resetAnchor":       "CALENDAR",
		}
		enableReq := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+entitlement.Slug, enablePayload)
		enableResp, err := testServer.App.Test(enableReq, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, enableResp.Body)
		require.Equal(t, fiber.StatusNoContent, enableResp.StatusCode)

		payload := map[string]any{"value": map[string]any{"type": "number", "value": 1}, "behavior": "append"}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusOK, resp.StatusCode)

		payloads := rolloverEvents(t)
		require.Len(t, payloads, 1)
		require.Nil(t, payloads[0].ClosedPeriodStart)
		require.Nil(t, payloads[0].ClosedPeriodEnd)
		require.False(t, payloads[0].IsSynthetic)
		require.Equal(t, 42.0, payloads[0].Value)
	})

	t.Run("WhenRolloverReportExceedsHardCap_PersistsRolloverButRejectsReport", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 5)

		currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		staleStart := currentWindow.Start.AddDate(0, -1, 0)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 999, 9, &staleStart)

		payload := map[string]any{"value": map[string]any{"type": "number", "value": 10}, "behavior": "append"}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)

		// The rollover persisted even though the incoming report was rejected.
		row := getUsageRow(t, instances[0].ID, entitlement.ID)
		actual, err := entitlementvalue.ParseNumberUsageValue(row.Value)
		require.NoError(t, err)
		require.Zero(t, actual.Value)
		require.Zero(t, actual.EventCount)
		require.True(t, row.PeriodStart.Time.Equal(currentWindow.Start))

		require.Len(t, rolloverEvents(t), 1, "rollover must persist exactly once despite the rejected report")

		// The next report must not roll over again.
		payload2 := map[string]any{"value": map[string]any{"type": "number", "value": 1}, "behavior": "append"}
		req2 := commonfixture.NewJSONRequest(t, "POST", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", payload2)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)
		require.Equal(t, fiber.StatusOK, resp2.StatusCode)

		require.Len(t, rolloverEvents(t), 1, "no duplicate rollover on the next report")
	})
}
