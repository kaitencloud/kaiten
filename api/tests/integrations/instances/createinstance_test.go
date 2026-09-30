package instances_test

import (
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstance"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateInstance(t *testing.T) {
	t.Run("WhenRequestIsValid_CreatesInstance", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		license := newLicense(t)
		payload := schema.Instance{
			Name:             "Test Instance",
			Description:      "This is a test instance",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata: map[string]any{
				"owner": "team-platform",
				"tier":  "gold",
			},
			LicenseID:  license.ID,
			CustomerID: customer.ID,
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.Equal(t, payload.Description, created.Description)
		require.Equal(t, payload.StartLicenseDate.UTC().Format(time.RFC3339), created.StartLicenseDate.UTC().Format(time.RFC3339))
		require.Equal(t, payload.EndLicenseDate.UTC().Format(time.RFC3339), created.EndLicenseDate.UTC().Format(time.RFC3339))
		require.Equal(t, payload.LicenseID, created.LicenseID)
		require.Equal(t, payload.CustomerID, created.CustomerID)
		require.Equal(t, payload.Metadata, created.Metadata)
		require.Equal(t, schema.InstanceStatusHealthy, created.Status)
		require.Nil(t, created.DeploymentZoneID, "DeploymentZoneID should be nil when not provided")

		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		stored, err := repo.GetInstance(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, created.Name, stored.Name)
		require.Equal(t, created.Description, stored.Description)
		require.Equal(t, created.StartLicenseDate.UTC().Format(time.RFC3339), stored.StartLicenseDate.UTC().Format(time.RFC3339))
		require.Equal(t, created.EndLicenseDate.UTC().Format(time.RFC3339), stored.EndLicenseDate.UTC().Format(time.RFC3339))
		require.Equal(t, created.LicenseID, stored.LicenseID)
		require.Equal(t, created.CustomerID, stored.CustomerID)
		require.Equal(t, created.Metadata, stored.Metadata)
		require.Equal(t, schema.InstanceStatusHealthy, stored.Status)
		require.Nil(t, stored.DeploymentZoneID, "DeploymentZoneID should be nil when not provided")

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the instance created event
		var eventData schema.Instance
		found := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceCreated.Name {
				assert.Equal(t, instanceEvents.InstanceCreated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected INSTANCE_CREATION event to be present")

		// Verify event data contains the created instance
		assert.Equal(t, created.ID, eventData.ID)
		assert.Equal(t, created.Name, eventData.Name)
		assert.Equal(t, created.Description, eventData.Description)
		assert.Equal(t, created.LicenseID, eventData.LicenseID)
		assert.Equal(t, created.CustomerID, eventData.CustomerID)
		assert.Equal(t, created.Metadata, eventData.Metadata)
		assert.Equal(t, schema.InstanceStatusHealthy, eventData.Status)

		// Verify NO INSTANCE_DEPLOYMENT event when no deployment zone
		deploymentEventFound := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceDeployed.Name {
				deploymentEventFound = true
				break
			}
		}
		require.False(t, deploymentEventFound, "Should NOT have INSTANCE_DEPLOYMENT event when no deployment zone")
	})

	t.Run("WhenRequestHasDeploymentZone_CreatesInstanceWithDeploymentZoneAndDispatchesDeploymentEvent", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		license := newLicense(t)
		deploymentZone := newDeploymentZone(t)

		payload := schema.Instance{
			Name:             "Test Instance With Deployment Zone",
			Description:      "This is a test instance with deployment zone",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			DeploymentZoneID: &deploymentZone.ID,
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.Instance](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.Equal(t, payload.Description, created.Description)
		require.Equal(t, payload.LicenseID, created.LicenseID)
		require.Equal(t, payload.CustomerID, created.CustomerID)
		require.Equal(t, schema.InstanceStatusHealthy, created.Status)
		require.NotNil(t, created.DeploymentZoneID, "DeploymentZoneID should be present")
		require.Equal(t, deploymentZone.ID, *created.DeploymentZoneID)

		// Verify stored instance has deployment zone
		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		stored, err := repo.GetInstance(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, stored.DeploymentZoneID, "Stored DeploymentZoneID should be present")
		require.Equal(t, deploymentZone.ID, *stored.DeploymentZoneID)

		// Verify outbox events
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		// Should have INSTANCE_CREATION event
		creationEventFound := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceCreated.Name {
				assert.Equal(t, instanceEvents.InstanceCreated.Type, event.EventType)
				creationEventFound = true
				break
			}
		}
		require.True(t, creationEventFound, "Expected INSTANCE_CREATION event to be present")

		// Should ALSO have INSTANCE_DEPLOYMENT event
		var deploymentEventData schema.Instance
		deploymentEventFound := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceDeployed.Name {
				assert.Equal(t, instanceEvents.InstanceDeployed.Type, event.EventType)
				err = json.Unmarshal(event.Data, &deploymentEventData)
				require.NoError(t, err)
				deploymentEventFound = true
				break
			}
		}
		require.True(t, deploymentEventFound, "Expected INSTANCE_DEPLOYMENT event to be present when deployment zone is set")

		// Verify deployment event data
		assert.Equal(t, created.ID, deploymentEventData.ID)
		assert.NotNil(t, deploymentEventData.DeploymentZoneID)
		assert.Equal(t, deploymentZone.ID, *deploymentEventData.DeploymentZoneID)
	})

	t.Run("WhenCustomerBelongsToAnotherOrganization_Returns404AndCreatesNothing", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		license := newLicense(t)
		neighbourCustomer := newCustomerIn(t, newNeighbourOrganization(t))

		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", schema.Instance{
			Name:             "Cross-tenant instance",
			Description:      "names another organization's customer",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        license.ID,
			CustomerID:       neighbourCustomer.ID,
		})

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
		require.Contains(t, string(bodyBytes), "CreateInstance.CustomerNotFound")
		require.Zero(t, countInstances(t), "no instance row must be created")
	})

	t.Run("WhenLicenseBelongsToAnotherOrganization_Returns404AndCreatesNothing", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		neighbourLicense := newLicenseIn(t, newNeighbourOrganization(t))

		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", schema.Instance{
			Name:             "Cross-tenant instance",
			Description:      "names another organization's license",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        neighbourLicense.ID,
			CustomerID:       customer.ID,
		})

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
		require.Contains(t, string(bodyBytes), "CreateInstance.LicenseNotFound")
		require.Zero(t, countInstances(t), "no instance row must be created")
	})

	t.Run("WhenDeploymentZoneBelongsToAnotherOrganization_Returns404AndCreatesNothing", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		license := newLicense(t)
		neighbourZone := newDeploymentZoneIn(t, newNeighbourOrganization(t))

		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", schema.Instance{
			Name:             "Cross-tenant instance",
			Description:      "names another organization's deployment zone",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			DeploymentZoneID: &neighbourZone.ID,
		})

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
		require.Contains(t, string(bodyBytes), "CreateInstance.DeploymentZoneNotFound")
		require.Zero(t, countInstances(t), "no instance row must be created")
	})

	t.Run("WhenCurrentUserDoesNotBelongToOrganization_Returns403", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		customer := newCustomer(t)
		license := newLicense(t)

		_, err := organizationdb.New(testServer.Dependencies.DB).DeleteUserOnOrganization(t.Context(), organizationdb.DeleteUserOnOrganizationParams{
			UserID:         testDb.DefaultData.UserID,
			OrganizationID: testDb.DefaultData.OrganizationID,
		})
		require.NoError(t, err)

		req := commonfixture.NewJSONRequest(t, "POST", "/api/instances", schema.Instance{
			Name:        "Forbidden instance",
			Description: "should be forbidden",
			Metadata:    map[string]any{},
			LicenseID:   license.ID,
			CustomerID:  customer.ID,
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
