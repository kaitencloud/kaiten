package instances_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetEntitlementsUsageMetricsByInstance(t *testing.T) {
	t.Run("WhenInstanceExists_ReturnsEmptyEntitlementsUsageMetrics", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[[]schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Empty(t, actual)
	})

	t.Run("WhenEntitlementAssignedButNoUsageReported_ReturnsDefaultValue", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[[]schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Len(t, actual, 1)
		require.Equal(t, entitlement.ID, actual[0].EntitlementID)
		require.NotNil(t, actual[0].Value.Number)
		require.EqualValues(t, 0, actual[0].Value.Number.Value)
	})

	t.Run("WhenInstanceExists_ReturnsEntitlementsUsageMetrics", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 1)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[[]schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Len(t, actual, 1)
		require.Equal(t, entitlement.ID, actual[0].EntitlementID)
		require.NotNil(t, actual[0].Value.Number)
		require.EqualValues(t, 1, actual[0].Value.Number.Value)
	})

	t.Run("WhenInstanceExists_ReturnsEntitlementsUsageMetrics_WithMultipleEntitlements", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		instanceSlug := instances[0].Slug
		licenseSlug := instances[0].LicenseSlug

		entitlement1 := newEntitlement(t)
		entitlement2 := newEntitlement(t)
		entitlement3 := newEntitlement(t)

		assignEntitlementToLicense(t, licenseSlug, entitlement1.Slug, 100)
		assignEntitlementToLicense(t, licenseSlug, entitlement2.Slug, 100)
		assignEntitlementToLicense(t, licenseSlug, entitlement3.Slug, 100)

		newEntitlementUsage(t, instanceSlug, entitlement1.Slug, 1)
		newEntitlementUsage(t, instanceSlug, entitlement2.Slug, 2)
		newEntitlementUsage(t, instanceSlug, entitlement3.Slug, 3)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instanceSlug+"/entitlements/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[[]schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Len(t, actual, 3)

		usageByEntitlement := make(map[string]float64)
		for _, usage := range actual {
			require.NotNil(t, usage.Value.Number)
			usageByEntitlement[usage.EntitlementID.String()] = usage.Value.Number.Value
		}

		require.Contains(t, usageByEntitlement, entitlement1.ID.String())
		require.Contains(t, usageByEntitlement, entitlement2.ID.String())
		require.Contains(t, usageByEntitlement, entitlement3.ID.String())

		require.Equal(t, 1.0, usageByEntitlement[entitlement1.ID.String()])
		require.Equal(t, 2.0, usageByEntitlement[entitlement2.ID.String()])
		require.Equal(t, 3.0, usageByEntitlement[entitlement3.ID.String()])
	})

	t.Run("WhenInstanceDoesNotExists_Return404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+uuid.New().String()+"/entitlements/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenInstanceIsDeleted_Return404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 1)

		// Delete the instance -- DeleteInstance is a real DELETE
		deleteReq := httptest.NewRequest("DELETE", "/api/instances/"+instances[0].Slug, nil)
		deleteResp, err := testServer.App.Test(deleteReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deleteResp.Body)
		require.Equal(t, fiber.StatusNoContent, deleteResp.StatusCode)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
