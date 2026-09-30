package entitlements_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetEntitlementByID(t *testing.T) {
	t.Run("WhenEntitlementExists_ReturnsEntitlement", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlements := createEntitlements(t, 1)
		expected := *entitlements[0]

		// Act
		req := httptest.NewRequest("GET", "/api/entitlements/"+entitlements[0].Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusOK)
		require.Equal(t, expected, actual)
	})

	t.Run("WhenEntitlementDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/entitlements/nonexistent-slug", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenEntitlementBelongsToGroups_ReturnsEmbeddedGroupRefs", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		entitlements := createEntitlements(t, 1)
		createEntitlementGroup(t, "Usage", "usage")
		addEntitlementToGroup(t, "usage", entitlements[0].Slug)

		req := httptest.NewRequest("GET", "/api/entitlements/"+entitlements[0].Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusOK)
		require.Len(t, actual.EntitlementGroups, 1)
		require.Equal(t, "usage", actual.EntitlementGroups[0].Slug)
	})
}
