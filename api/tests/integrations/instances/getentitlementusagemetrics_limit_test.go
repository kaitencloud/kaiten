package instances_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// TestGetEntitlementUsageMetrics_Limit pins the limit alongside the usage:
// rendering "5 / 100" must not need a second call to the license entitlement.
func TestGetEntitlementUsageMetrics_Limit(t *testing.T) {
	t.Run("WhenNumberEntitlement_ReturnsLicenseGrantAsLimit", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 5)

		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.EqualValues(t, 5, actual.Value.Number.Value)
		require.NotNil(t, actual.Limit)
		require.NotNil(t, actual.Limit.Number)
		require.EqualValues(t, 100, actual.Limit.Number.Value)
	})

	t.Run("WhenBooleanEntitlement_LimitRepeatsTheGrantedValue", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlementWithType(t, entitlementschema.Boolean)
		assignBooleanEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, true)

		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.NotNil(t, actual.Value.Boolean)
		require.True(t, actual.Value.Boolean.Value)
		require.NotNil(t, actual.Limit)
		require.NotNil(t, actual.Limit.Boolean)
		require.True(t, actual.Limit.Boolean.Value)
	})

	t.Run("WhenListingUsage_EveryItemCarriesItsLimit", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 5)

		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[[]schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Len(t, actual, 1)
		require.EqualValues(t, 5, actual[0].Value.Number.Value)
		require.NotNil(t, actual[0].Limit)
		require.NotNil(t, actual[0].Limit.Number)
		require.EqualValues(t, 100, actual[0].Limit.Number.Value)
	})

	t.Run("WhenReportingUsage_TheResponseCarriesTheLimit", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)

		req := commonfixture.NewJSONRequest(
			t, "POST",
			"/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage",
			map[string]any{"value": map[string]any{"type": "number", "value": 7}, "behavior": "append"},
		)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.EqualValues(t, 7, actual.Value.Number.Value)
		require.NotNil(t, actual.Limit)
		require.NotNil(t, actual.Limit.Number)
		require.EqualValues(t, 100, actual.Limit.Number.Value)
	})
}
