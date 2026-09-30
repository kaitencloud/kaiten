package instances_test

import (
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetEntitlementsUsageMetricsByInstanceByEntitlement(t *testing.T) {
	t.Run("WhenInstanceAndEntitlementExists_ReturnEntitlementUsageMetric", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)
		newEntitlementUsage(t, instances[0].Slug, entitlement.Slug, 1)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Equal(t, entitlement.ID, actual.EntitlementID)
		require.NotNil(t, actual.Value.Number)
		require.EqualValues(t, 1, actual.Value.Number.Value)
	})

	t.Run("WhenEntitlementAssignedButNoUsageReported_ReturnDefaultValue", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)
		assignEntitlementToLicense(t, instances[0].LicenseSlug, entitlement.Slug, 100)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.EntitlementUsage](t, resp, fiber.StatusOK)
		require.Equal(t, entitlement.ID, actual.EntitlementID)
		require.NotNil(t, actual.Value.Number)
		require.EqualValues(t, 0, actual.Value.Number.Value)
	})

	t.Run("WhenEntitlementNotAssignedToLicense_Return404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		entitlement := newEntitlement(t)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Contains(t, string(bodyBytes), "GetEntitlementUsageMetrics.EntitlementNotAssigned")
	})

	t.Run("WhenEntitlementDoesNotExist_Return404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+uuid.New().String()+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Contains(t, string(bodyBytes), "GetEntitlementUsageMetrics.EntitlementNotFound")
	})

	t.Run("WhenInstanceNotExists_Return404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+uuid.New().String()+"/entitlements/"+uuid.New().String()+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Contains(t, string(bodyBytes), "GetEntitlementUsageMetrics.InstanceNotFound")
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
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/entitlements/"+entitlement.Slug+"/usage", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Contains(t, string(bodyBytes), "GetEntitlementUsageMetrics.InstanceNotFound")
	})
}
