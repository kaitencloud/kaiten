package instances_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetInstanceByID(t *testing.T) {
	t.Run("WhenInstanceExists_ReturnsInstance", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		expected := *instances[0]

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusOK)
		require.Equal(t, expected, actual)
		require.Equal(t, schema.InstanceStatusHealthy, actual.Status)
	})

	t.Run("WhenInstanceDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/instances/nonexistent-slug", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenInstanceIsDeleted_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		instanceToDelete := instances[0]

		// Delete the instance -- DeleteInstance is a real DELETE
		deleteReq := httptest.NewRequest("DELETE", "/api/instances/"+instanceToDelete.Slug, nil)
		deleteResp, err := testServer.App.Test(deleteReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deleteResp.Body)
		require.Equal(t, fiber.StatusNoContent, deleteResp.StatusCode)

		// Act - Try to get the deleted instance
		req := httptest.NewRequest("GET", "/api/instances/"+instanceToDelete.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert - Should return 404: the row is gone
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
