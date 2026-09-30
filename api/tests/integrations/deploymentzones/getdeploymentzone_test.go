package deploymentzones_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetDeploymentZoneByID(t *testing.T) {
	t.Run("WhenDeploymentZoneExists_ReturnsDeploymentZone", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		deploymentZones := createDeploymentZones(t, 1)
		expected := *deploymentZones[0]

		// Act
		req := httptest.NewRequest("GET", "/api/deployment-zones/"+deploymentZones[0].Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusOK)
		require.Equal(t, expected, actual)
	})

	t.Run("WhenDeploymentZoneDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		nonExistentID := uuid.New().String()

		// Act
		req := httptest.NewRequest("GET", "/api/deployment-zones/"+nonExistentID, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
