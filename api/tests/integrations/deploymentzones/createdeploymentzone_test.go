package deploymentzones_test

import (
	"encoding/json"
	"io"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	deploymentZoneEvents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/getdeploymentzone"
	deploymentzonesdb "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateDeploymentZone(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenRequestIsValidWithoutMetadata_CreatesDeploymentZone", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		payload := schema.DeploymentZone{
			Name:        "Sweet deployment zone",
			Type:        "Super cloud provider region",
			Description: "This is a sweet deployment zone for testing",
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.Equal(t, payload.Type, created.Type)
		require.Equal(t, payload.Description, created.Description)

		repo := getdeploymentzone.NewQueryRepository(deploymentzonesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetDeploymentZoneBySlug(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.Name, stored.Name)
		require.Equal(t, payload.Type, stored.Type)
		require.Equal(t, payload.Description, stored.Description)
	})

	t.Run("WhenRequestIsValidWithMetadata_CreatesDeploymentZone", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		payload := schema.DeploymentZone{
			Name: "Sweet deployment zone",
			Type: "Super cloud provider region",
			Metadata: map[string]interface{}{
				"env": "production",
				"sku": map[string]interface{}{
					"tier":   "expensive",
					"backup": true,
				},
			},
			Description: "This is a sweet deployment zone for testing",
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.Equal(t, payload.Type, created.Type)
		require.Equal(t, payload.Metadata, created.Metadata)
		require.Equal(t, payload.Description, created.Description)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the deployment zone created event
		var deploymentZoneCreatedEvent *outboxdb.OutboxEvent
		for _, event := range events {
			if event.EventName == deploymentZoneEvents.DeploymentZoneCreated.Name {
				deploymentZoneCreatedEvent = &event
				break
			}
		}
		require.NotNil(t, deploymentZoneCreatedEvent, "Expected DEPLOYMENT_ZONE_CREATION event to be present")
		assert.Equal(t, deploymentZoneEvents.DeploymentZoneCreated.Type, deploymentZoneCreatedEvent.EventType)

		// Verify event data contains the created deployment zone with external ID
		var eventData schema.DeploymentZone
		err = json.Unmarshal(deploymentZoneCreatedEvent.Data, &eventData)
		require.NoError(t, err)
		assert.Equal(t, created.Name, eventData.Name)
		assert.Equal(t, created.Type, eventData.Type)
		assert.Equal(t, created.Metadata, eventData.Metadata)
		assert.Equal(t, created.Description, eventData.Description)
	})

	t.Run("WhenRequestIsValidWithRelease_CreatesDeploymentZoneWithAssociatedDeployment", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		releases := createReleases(t, 1)

		payload := schema.DeploymentZone{
			Name:        "Sweet deployment zone",
			Type:        "Super cloud provider region",
			Description: "This is a sweet deployment zone for testing",
			ReleaseID:   &releases[0].ID,
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.DeploymentZone](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.Equal(t, payload.Type, created.Type)
		require.Equal(t, payload.Description, created.Description)

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
		assert.Equal(t, created.ID, eventData.DeploymentZoneID)
		assert.Equal(t, *created.ReleaseID, eventData.ReleaseID)

		repo := getdeploymentzone.NewQueryRepository(deploymentzonesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetDeploymentZoneBySlug(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.Name, stored.Name)
		require.Equal(t, payload.Type, stored.Type)
		require.Equal(t, payload.Description, stored.Description)
		require.Equal(t, *payload.ReleaseID, releases[0].ID)
	})

	t.Run("WhenCurrentUserDoesNotBelongToOrganization_Returns403", func(t *testing.T) {
		t.Cleanup(resetDB)

		_, err := organizationdb.New(testServer.Dependencies.DB).DeleteUserOnOrganization(t.Context(), organizationdb.DeleteUserOnOrganizationParams{
			UserID:         testDb.DefaultData.UserID,
			OrganizationID: testDb.DefaultData.OrganizationID,
		})
		require.NoError(t, err)

		req := commonfixture.NewJSONRequest(t, "POST", "/api/deployment-zones", schema.DeploymentZone{
			Name:        "Forbidden zone",
			Type:        "region",
			Description: "should be forbidden",
		})
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		bodyString := string(bodyBytes)

		require.Equal(t, fiber.StatusForbidden, resp.StatusCode)
		require.Contains(t, bodyString, "CurrentUser.NotInOrganization")
		require.Contains(t, bodyString, testDb.DefaultData.UserID.String())
		require.Contains(t, bodyString, testDb.DefaultData.OrganizationID.String())
		require.NotContains(t, bodyString, "no rows in result set")
	})
}
