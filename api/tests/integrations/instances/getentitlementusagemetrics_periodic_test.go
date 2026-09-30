package instances_test

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetEntitlementUsageMetrics_Periodic(t *testing.T) {
	t.Run("WhenLifetimeEntitlement_PeriodBoundsAreNull", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t) // lifetime: no reset_period
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 5)

		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Nil(t, actual.CurrentPeriodStart)
		require.Nil(t, actual.CurrentPeriodEnd)
		require.EqualValues(t, 5, actual.Value.Number.Value)
	})

	t.Run("WhenRowMatchesCurrentWindow_ReturnsStoredValueWithBounds", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 30, 2, &currentWindow.Start)

		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.EqualValues(t, 30, actual.Value.Number.Value)
		require.EqualValues(t, 2, actual.Value.Number.EventCount)
		require.NotNil(t, actual.CurrentPeriodStart)
		require.True(t, actual.CurrentPeriodStart.Equal(currentWindow.Start))
		require.NotNil(t, actual.CurrentPeriodEnd)
		require.True(t, actual.CurrentPeriodEnd.Equal(currentWindow.End))
	})

	t.Run("WhenRowIsStale_ReturnsZeroWithCurrentWindowBoundsAndDoesNotWrite", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		staleStart := currentWindow.Start.AddDate(0, -2, 0)
		seedUsageRow(t, instances[0].Slug, entitlement.Slug, 777, 6, &staleStart)

		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.EqualValues(t, 0, actual.Value.Number.Value, "a stale row must read back as logical {0,0}")
		require.EqualValues(t, 0, actual.Value.Number.EventCount)
		require.NotNil(t, actual.CurrentPeriodStart)
		require.True(t, actual.CurrentPeriodStart.Equal(currentWindow.Start))

		// The read must not have written anything: the row is still stale.
		row := getUsageRow(t, instances[0].ID, entitlement.ID)
		stored, err := entitlementvalue.ParseNumberUsageValue(row.Value)
		require.NoError(t, err)
		require.EqualValues(t, 777, stored.Value, "a lazy read must never mutate the stored row")
		require.True(t, row.PeriodStart.Time.Equal(staleStart))
		require.Empty(t, rolloverEvents(t), "reads must never emit a rollover event")
	})

	t.Run("WhenNoUsageReportedYet_ReturnsZeroWithCurrentWindowBounds", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newPeriodicEntitlement(t, period.Day, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 1000)

		currentWindow, err := period.Current(time.Now().UTC(), period.Day, period.Calendar, time.Time{})
		require.NoError(t, err)

		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.EqualValues(t, 0, actual.Value.Number.Value)
		require.NotNil(t, actual.CurrentPeriodStart)
		require.True(t, actual.CurrentPeriodStart.Equal(currentWindow.Start))
	})
}

func TestGetEntitlementsUsageMetrics_Periodic(t *testing.T) {
	t.Run("WhenMixOfLifetimeAndPeriodic_EachHasCorrectBounds", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		lifetime := newEntitlement(t)
		periodic := newPeriodicEntitlement(t, period.Month, period.Calendar)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, lifetime.Slug, 100)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, periodic.Slug, 100)

		currentWindow, err := period.Current(time.Now().UTC(), period.Month, period.Calendar, time.Time{})
		require.NoError(t, err)
		staleStart := currentWindow.Start.AddDate(0, -1, 0)
		seedUsageRow(t, instances[0].Slug, periodic.Slug, 15, 1, &staleStart)
		newEntitlementUsage(t, instances[0].Slug, lifetime.Slug, 9)

		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[[]schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Len(t, actual, 2)

		byID := make(map[string]schema.EntitlementUsage, 2)
		for _, u := range actual {
			byID[u.EntitlementID.String()] = u
		}

		lifetimeUsage := byID[lifetime.ID.String()]
		require.Nil(t, lifetimeUsage.CurrentPeriodStart)
		require.EqualValues(t, 9, lifetimeUsage.Value.Number.Value)

		periodicUsage := byID[periodic.ID.String()]
		require.NotNil(t, periodicUsage.CurrentPeriodStart)
		require.True(t, periodicUsage.CurrentPeriodStart.Equal(currentWindow.Start))
		require.EqualValues(t, 0, periodicUsage.Value.Number.Value, "the stale row must read back as {0,0}")
	})
}
