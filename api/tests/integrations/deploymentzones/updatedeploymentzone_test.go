package deploymentzones_test

import (
	"encoding/json"
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

func TestUpdateDeploymentZone(t *testing.T) {
	t.Run("WhenRequestIsValid_UpdatesDeploymentZone", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		deploymentZones := createDeploymentZones(t, 1)
		toUpdate := deploymentZones[0]

		payload := schema.DeploymentZone{
			Name: "Updated deployment zone",
			Type: "New cloud provider region",
			Metadata: map[string]interface{}{
				"env": "production",
				"sku": map[string]interface{}{
					"tier":   "expensive",
					"backup": true,
				},
			},
			Description: "Whatever this contains",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getdeploymentzone.NewQueryRepository(deploymentzonesdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetDeploymentZoneBySlug(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.Name, updated.Name)
		require.Equal(t, payload.Type, updated.Type)
		require.Equal(t, payload.Description, updated.Description)
		require.NotNil(t, updated.Metadata)
		require.Equal(t, payload.Metadata, updated.Metadata)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the deploymentZone updated event
		var deploymentZoneUpdatedEvent *outboxdb.OutboxEvent
		for _, event := range events {
			if event.EventName == deploymentZoneEvents.DeploymentZoneUpdated.Name {
				deploymentZoneUpdatedEvent = &event
				break
			}
		}
		require.NotNil(t, deploymentZoneUpdatedEvent, "Expected DEPLOYMENT_ZONE_UPDATE event to be present")
		assert.Equal(t, deploymentZoneEvents.DeploymentZoneUpdated.Type, deploymentZoneUpdatedEvent.EventType)

		// Verify event data contains the updated deploymentZone
		var eventData schema.DeploymentZone
		err = json.Unmarshal(deploymentZoneUpdatedEvent.Data, &eventData)
		require.NoError(t, err)
		assert.Equal(t, updated.Name, eventData.Name)
		assert.Equal(t, updated.Type, eventData.Type)
		assert.Equal(t, updated.Metadata, eventData.Metadata)
		assert.Equal(t, updated.Description, eventData.Description)
	})

	t.Run("WhenRequestIsValidWithRelease_UpdatesDeploymentZoneWithAssociatedDeployment", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		deploymentZones := createDeploymentZones(t, 1)
		toUpdate := deploymentZones[0]

		releases := createReleases(t, 1)

		payload := schema.DeploymentZone{
			Name:        toUpdate.Name,
			Type:        toUpdate.Type,
			Metadata:    toUpdate.Metadata,
			Description: toUpdate.Description,
			ReleaseID:   &releases[0].ID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getdeploymentzone.NewQueryRepository(deploymentzonesdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetDeploymentZoneBySlug(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, *payload.ReleaseID, *updated.ReleaseID)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the deployment zone created event
		var releaseDeployedEvent *outboxdb.OutboxEvent
		for _, event := range events {
			if event.EventName == deploymentZoneEvents.ReleaseDeployed.Name {
				releaseDeployedEvent = &event
				break
			}
		}
		require.NotNil(t, releaseDeployedEvent, "Expected RELEASE_DEPLOYMENT event to be present")
		assert.Equal(t, deploymentZoneEvents.ReleaseDeployed.Type, releaseDeployedEvent.EventType)

		// Verify event data contains the created deployment zone with external ID
		var eventData schema.Deployment
		err = json.Unmarshal(releaseDeployedEvent.Data, &eventData)
		require.NoError(t, err)
		assert.Equal(t, updated.ID, eventData.DeploymentZoneID)
		assert.Equal(t, *updated.ReleaseID, eventData.ReleaseID)
	})

	t.Run("WhenRollingBackToAPreviousRelease_RecordsANewDeployment", func(t *testing.T) {
		// deployment used to be keyed on
		// (deployment_zone_id, release_id), so pointing a zone back at a
		// release it had already run answered 409
		// CreateDeployment.AlreadyDeployed -- the data model forbade
		// recording a rollback. The log is append-only now.
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := createDeploymentZones(t, 1)[0]
		releases := createReleases(t, 2)

		deploy := func(releaseID uuid.UUID) int {
			payload := schema.DeploymentZone{
				Name:        toUpdate.Name,
				Type:        toUpdate.Type,
				Metadata:    toUpdate.Metadata,
				Description: toUpdate.Description,
				ReleaseID:   &releaseID,
			}
			req := commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+toUpdate.Slug, payload)
			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, resp.Body)
			return resp.StatusCode
		}

		// Act — deploy v1, then v2, then roll back to v1.
		require.Equal(t, fiber.StatusNoContent, deploy(releases[0].ID))
		require.Equal(t, fiber.StatusNoContent, deploy(releases[1].ID))
		require.Equal(t, fiber.StatusNoContent, deploy(releases[0].ID))

		// Assert — the zone is back on v1 and all three deployments are kept.
		repo := getdeploymentzone.NewQueryRepository(deploymentzonesdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetDeploymentZoneBySlug(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.ReleaseID)
		require.Equal(t, releases[0].ID, *updated.ReleaseID)

		deployments, err := deploymentzonesdb.New(testServer.Dependencies.DB).GetDeployments(
			t.Context(),
			deploymentzonesdb.GetDeploymentsParams{
				OrganizationID:   testDb.DefaultData.OrganizationID,
				DeploymentZoneID: toUpdate.ID,
			},
		)
		require.NoError(t, err)
		require.Len(t, deployments, 3, "each deployment is its own row, rollback included")
		require.Equal(t, releases[0].ID, deployments[0].ReleaseID, "newest first")
	})

	t.Run("WhenReleaseUnchanged_UpdatesWithoutNewDeployment", func(t *testing.T) {
		// Clients echo the zone's current release back in the PUT body. The
		// update must treat an unchanged release as a no-op: re-recording the
		// release already running is not a deployment event.
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		deploymentZones := createDeploymentZones(t, 1)
		toUpdate := deploymentZones[0]
		releases := createReleases(t, 1)

		deployPayload := schema.DeploymentZone{
			Name:        toUpdate.Name,
			Type:        toUpdate.Type,
			Metadata:    toUpdate.Metadata,
			Description: toUpdate.Description,
			ReleaseID:   &releases[0].ID,
		}
		deployReq := commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+toUpdate.Slug, deployPayload)
		deployResp, err := testServer.App.Test(deployReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deployResp.Body)
		require.Equal(t, fiber.StatusNoContent, deployResp.StatusCode)

		// Act — edit the zone while resending the already-deployed release
		editPayload := deployPayload
		editPayload.Name = "Renamed deployed zone"
		editReq := commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+toUpdate.Slug, editPayload)
		editResp, err := testServer.App.Test(editReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, editResp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, editResp.StatusCode)
		repo := getdeploymentzone.NewQueryRepository(deploymentzonesdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetDeploymentZoneBySlug(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, editPayload.Name, updated.Name)
		require.NotNil(t, updated.ReleaseID, "The deployed release must be preserved")
		require.Equal(t, releases[0].ID, *updated.ReleaseID)

		// The unchanged release is not a new deployment: only the first PUT
		// emits RELEASE_DEPLOYMENT.
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		releaseDeployedCount := 0
		for _, event := range events {
			if event.EventName == deploymentZoneEvents.ReleaseDeployed.Name {
				releaseDeployedCount++
			}
		}
		require.Equal(t, 1, releaseDeployedCount, "Expected only the initial RELEASE_DEPLOYMENT event")
	})

	t.Run("WhenDeploymentZoneDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		nonExistentID := uuid.New().String()
		payload := schema.DeploymentZone{
			Name: "Updated deployment zone",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/deployment-zones/"+nonExistentID, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
