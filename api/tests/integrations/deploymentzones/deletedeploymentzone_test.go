package deploymentzones_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	deploymentZoneEvents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzone"
	deploymentzonesdb "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteDeploymentZone(t *testing.T) {
	t.Run("WhenDeploymentZoneExists_DeletesDeploymentZone", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		deploymentZones := createDeploymentZones(t, 1)
		toDelete := deploymentZones[0]

		// Act
		req := httptest.NewRequest("DELETE", "/api/deployment-zones/"+toDelete.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getdeploymentzone.NewQueryRepository(deploymentzonesdb.New(testServer.Dependencies.DB))
		_, err = repo.GetDeploymentZoneBySlug(t.Context(), toDelete.Slug, testDb.DefaultData.OrganizationID)
		require.Error(t, err)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the deploymentZone deleted event
		var deploymentZoneDeletedEvent *outboxdb.OutboxEvent
		for _, event := range events {
			if event.EventName == deploymentZoneEvents.DeploymentZoneDeleted.Name {
				deploymentZoneDeletedEvent = &event
				break
			}
		}
		require.NotNil(t, deploymentZoneDeletedEvent, "Expected DEPLOYMENT_ZONE_DELETION event to be present")
		assert.Equal(t, deploymentZoneEvents.DeploymentZoneDeleted.Type, deploymentZoneDeletedEvent.EventType)

		// Verify event data contains the deleted deploymentZone information
		var eventData schema.DeploymentZone
		err = json.Unmarshal(deploymentZoneDeletedEvent.Data, &eventData)
		require.NoError(t, err)
		assert.Equal(t, toDelete.ID, eventData.ID)
	})

	t.Run("WhenDeploymentZoneDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		nonExistentID := uuid.New().String()

		// Act
		req := httptest.NewRequest("DELETE", "/api/deployment-zones/"+nonExistentID, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
