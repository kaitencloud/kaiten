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
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestUpdateInstance(t *testing.T) {
	t.Run("WhenRequestIsValid_UpdatesInstance", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		toUpdate := instances[0]
		customer := newCustomer(t)
		license := newLicense(t)
		payload := schema.Instance{
			Name:             "Test Instance",
			Description:      "This is a test instance",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata: map[string]any{
				"owner":  "team-ops",
				"region": "eu-west-3",
			},
			LicenseID:  license.ID,
			CustomerID: customer.ID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		updated, err := repo.GetInstance(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.Name, updated.Name)
		require.Equal(t, payload.Description, updated.Description)
		require.Equal(t, payload.CustomerID, updated.CustomerID)
		require.Equal(t, payload.LicenseID, updated.LicenseID)
		require.Equal(t, payload.Metadata, updated.Metadata)
		require.Nil(t, updated.DeploymentZoneID, "DeploymentZoneID should be nil when not provided")
		require.NotNil(t, updated.UpdatedBy)
		require.NotNil(t, updated.UpdatedAt)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the instance updated event
		var eventData schema.Instance
		found := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceUpdated.Name {
				assert.Equal(t, instanceEvents.InstanceUpdated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected INSTANCE_UPDATE event to be present")

		// Verify event data contains the updated instance
		assert.Equal(t, toUpdate.ID, eventData.ID)
		assert.Equal(t, payload.Name, eventData.Name)
		assert.Equal(t, payload.Description, eventData.Description)
		assert.Equal(t, payload.LicenseID, eventData.LicenseID)
		assert.Equal(t, payload.CustomerID, eventData.CustomerID)
		assert.Equal(t, payload.Metadata, eventData.Metadata)

		// Verify NO INSTANCE_DEPLOYMENT event when no deployment zone change
		deploymentEventFound := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceDeployed.Name {
				deploymentEventFound = true
				break
			}
		}
		require.False(t, deploymentEventFound, "Should NOT have INSTANCE_DEPLOYMENT event when no deployment zone")

		// Verify NO INSTANCE_MIGRATION event
		migrationEventFound := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceMigrated.Name {
				migrationEventFound = true
				break
			}
		}
		require.False(t, migrationEventFound, "Should NOT have INSTANCE_MIGRATION event when no deployment zone change")
	})

	t.Run("WhenAddingDeploymentZone_DispatchesDeploymentEvent", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		toUpdate := instances[0]
		customer := newCustomer(t)
		license := newLicense(t)
		deploymentZone := newDeploymentZone(t)

		payload := schema.Instance{
			Name:             "Test Instance",
			Description:      "This is a test instance with deployment zone",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			DeploymentZoneID: &deploymentZone.ID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		// Verify instance was updated with deployment zone
		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		updated, err := repo.GetInstance(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.DeploymentZoneID, "DeploymentZoneID should be present")
		require.Equal(t, deploymentZone.ID, *updated.DeploymentZoneID)

		// Verify outbox events
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		// Should have INSTANCE_UPDATE event
		updateEventFound := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceUpdated.Name {
				updateEventFound = true
				break
			}
		}
		require.True(t, updateEventFound, "Expected INSTANCE_UPDATE event to be present")

		// Should ALSO have INSTANCE_DEPLOYMENT event (not migration, since there was no previous deployment zone)
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
		require.True(t, deploymentEventFound, "Expected INSTANCE_DEPLOYMENT event when adding deployment zone to instance without one")

		// Verify deployment event data
		assert.Equal(t, toUpdate.ID, deploymentEventData.ID)
		assert.NotNil(t, deploymentEventData.DeploymentZoneID)
		assert.Equal(t, deploymentZone.ID, *deploymentEventData.DeploymentZoneID)

		// Should NOT have INSTANCE_MIGRATION event
		migrationEventFound := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceMigrated.Name {
				migrationEventFound = true
				break
			}
		}
		require.False(t, migrationEventFound, "Should NOT have INSTANCE_MIGRATION event when adding first deployment zone")
	})

	t.Run("WhenChangingDeploymentZone_DispatchesMigrationEvent", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		license := newLicense(t)
		deploymentZone1 := newDeploymentZone(t)
		deploymentZone2 := newDeploymentZone(t)

		// Create instance with first deployment zone
		createPayload := schema.Instance{
			Name:             "Test Instance",
			Description:      "This is a test instance",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			DeploymentZoneID: &deploymentZone1.ID,
		}
		createReq := commonfixture.NewJSONRequest(t, "POST", "/api/instances", createPayload)
		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)
		created := commonfixture.AssertJSONResponse[schema.Instance](t, createResp, fiber.StatusCreated)

		// Update instance with different deployment zone
		updatePayload := schema.Instance{
			Name:             "Test Instance Updated",
			Description:      "This is a test instance migrated",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			DeploymentZoneID: &deploymentZone2.ID,
		}
		updateReq := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+created.Slug, updatePayload)

		// Act
		updateResp, err := testServer.App.Test(updateReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, updateResp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, updateResp.StatusCode)

		// Verify instance was updated with new deployment zone
		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		updated, err := repo.GetInstance(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.DeploymentZoneID)
		require.Equal(t, deploymentZone2.ID, *updated.DeploymentZoneID)

		// Verify outbox events
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		// Should have INSTANCE_UPDATE event
		updateEventCount := 0
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceUpdated.Name {
				updateEventCount++
			}
		}
		require.Equal(t, 1, updateEventCount, "Expected exactly 1 INSTANCE_UPDATE event from the update operation")

		// Should have INSTANCE_MIGRATION event (since we're changing from one deployment zone to another)
		var migrationEventData schema.Instance
		migrationEventFound := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceMigrated.Name {
				assert.Equal(t, instanceEvents.InstanceMigrated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &migrationEventData)
				require.NoError(t, err)
				migrationEventFound = true
				break
			}
		}
		require.True(t, migrationEventFound, "Expected INSTANCE_MIGRATION event when changing deployment zone")

		// Verify migration event data
		assert.Equal(t, created.ID, migrationEventData.ID)
		assert.NotNil(t, migrationEventData.DeploymentZoneID)
		assert.Equal(t, deploymentZone2.ID, *migrationEventData.DeploymentZoneID)
	})

	t.Run("WhenDeploymentZoneOmitted_PreservesExistingZone", func(t *testing.T) {
		// Regression: the edit UI does not expose the deployment zone
		// and omits it from the PUT body; the update must not detach the
		// instance from its zone.
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		license := newLicense(t)
		deploymentZone := newDeploymentZone(t)

		createPayload := schema.Instance{
			Name:             "Test Instance",
			Description:      "This is a test instance",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
			DeploymentZoneID: &deploymentZone.ID,
		}
		createReq := commonfixture.NewJSONRequest(t, "POST", "/api/instances", createPayload)
		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)
		created := commonfixture.AssertJSONResponse[schema.Instance](t, createResp, fiber.StatusCreated)

		// Update without DeploymentZoneID (e.g. a platform-only edit)
		updatePayload := schema.Instance{
			Name:             created.Name,
			Description:      created.Description,
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
		}
		updateReq := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+created.Slug, updatePayload)

		// Act
		updateResp, err := testServer.App.Test(updateReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, updateResp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, updateResp.StatusCode)

		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		updated, err := repo.GetInstance(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.DeploymentZoneID, "DeploymentZoneID should be preserved when omitted from the PUT body")
		require.Equal(t, deploymentZone.ID, *updated.DeploymentZoneID)

		// The preserved zone is not a change: the only INSTANCE_DEPLOYMENT
		// event is the one from the creation, and there is no migration.
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		deploymentEventCount := 0
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceDeployed.Name {
				deploymentEventCount++
			}
			require.NotEqual(t, instanceEvents.InstanceMigrated.Name, event.EventName, "Should NOT have INSTANCE_MIGRATION event when the zone is unchanged")
		}
		require.Equal(t, 1, deploymentEventCount, "Expected only the creation INSTANCE_DEPLOYMENT event")
	})

	t.Run("WhenSlugProvided_RenamesTheInstanceAndReportsTheNewSlug", func(t *testing.T) {
		// The metering convention: a tracked instance's slug has to equal the
		// derived organization id, which onboarding only knows once the Clerk
		// organization exists -- after the instance was created.
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		toUpdate := instances[0]
		const newSlug = "renamed-by-onboarding"

		payload := schema.Instance{
			Name:             toUpdate.Name,
			Description:      toUpdate.Description,
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        toUpdate.LicenseID,
			CustomerID:       toUpdate.CustomerID,
			Slug:             newSlug,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		renamed, err := repo.GetInstance(t.Context(), newSlug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, toUpdate.ID, renamed.ID, "the rename must move the same instance, not create another")
		require.Equal(t, newSlug, renamed.Slug)

		_, err = repo.GetInstance(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.Error(t, err, "the old slug must no longer address the instance")

		// The INSTANCE_UPDATE payload is the full updated instance, so a
		// consumer keyed on the slug sees the new one without a second read.
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		var eventData schema.Instance
		found := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceUpdated.Name {
				require.NoError(t, json.Unmarshal(event.Data, &eventData))
				found = true
				break
			}
		}
		require.True(t, found, "Expected INSTANCE_UPDATE event to be present")
		assert.Equal(t, toUpdate.ID, eventData.ID)
		assert.Equal(t, newSlug, eventData.Slug, "the event payload must carry the new slug")
	})

	t.Run("WhenSlugOmitted_KeepsTheCurrentSlug", func(t *testing.T) {
		// Every client written before the slug was mutable omits it; the
		// update it always sent must still leave the instance where it is.
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		toUpdate := instances[0]

		payload := schema.Instance{
			Name:             "Renamed instance, same slug",
			Description:      toUpdate.Description,
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        toUpdate.LicenseID,
			CustomerID:       toUpdate.CustomerID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		updated, err := repo.GetInstance(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, toUpdate.Slug, updated.Slug, "an omitted slug must be preserved")
		require.Equal(t, payload.Name, updated.Name, "the rest of the update must still have been applied")
	})

	t.Run("WhenSlugIsTheCurrentOne_IsAnOrdinaryUpdate", func(t *testing.T) {
		// A caller that converges by retrying sends the slug it wants, which
		// on the second delivery is the slug the instance already has. That is
		// the instance's own row, so it conflicts with nothing.
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		toUpdate := instances[0]

		payload := schema.Instance{
			Name:             "Same slug, new name",
			Description:      toUpdate.Description,
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        toUpdate.LicenseID,
			CustomerID:       toUpdate.CustomerID,
			Slug:             toUpdate.Slug,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		updated, err := repo.GetInstance(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, toUpdate.Slug, updated.Slug)
		require.Equal(t, payload.Name, updated.Name)
	})

	t.Run("WhenSlugIsTakenByAnotherInstance_Returns409AndLeavesTheInstanceByteIdentical", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 2)
		toUpdate := instances[0]
		neighbour := instances[1]

		const snapshotQuery = `SELECT to_jsonb(i) FROM instance i WHERE id = $1`
		before := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, toUpdate.ID)

		payload := schema.Instance{
			Name:             "Wants a slug it cannot have",
			Description:      toUpdate.Description,
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        toUpdate.LicenseID,
			CustomerID:       toUpdate.CustomerID,
			Slug:             neighbour.Slug,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)
		require.Contains(t, string(bodyBytes), "UpdateInstance.SlugConflict")
		after := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, toUpdate.ID)
		require.Equal(t, before, after, "a rejected rename must roll the whole update back")
	})

	t.Run("WhenSlugIsMalformed_Returns422", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		toUpdate := instances[0]

		payload := schema.Instance{
			Name:             "Malformed slug",
			Description:      toUpdate.Description,
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        toUpdate.LicenseID,
			CustomerID:       toUpdate.CustomerID,
			Slug:             "Not A Slug",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)

		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		unchanged, err := repo.GetInstance(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, toUpdate.Name, unchanged.Name, "a rejected body must not apply any of its fields")
	})

	t.Run("WhenInstanceDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		customer := newCustomer(t)
		license := newLicense(t)
		payload := schema.Instance{
			Name:             "Test Instance",
			Description:      "This is a test instance",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/nonexistent-slug", payload)

		// Act
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
		toUpdate := instances[0]

		// Delete the instance -- DeleteInstance is a real DELETE
		deleteReq := commonfixture.NewJSONRequest(t, "DELETE", "/api/instances/"+toUpdate.Slug, nil)
		deleteResp, err := testServer.App.Test(deleteReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deleteResp.Body)
		require.Equal(t, fiber.StatusNoContent, deleteResp.StatusCode)

		// Try to update the soft-deleted instance
		customer := newCustomer(t)
		license := newLicense(t)
		payload := schema.Instance{
			Name:             "Updated Test Instance",
			Description:      "Updated description",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        license.ID,
			CustomerID:       customer.ID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenCustomerBelongsToAnotherOrganization_Returns404AndLeavesTheInstanceByteIdentical", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		toUpdate := instances[0]
		neighbourCustomer := newCustomerIn(t, newNeighbourOrganization(t))

		const snapshotQuery = `SELECT to_jsonb(i) FROM instance i WHERE id = $1`
		before := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, toUpdate.ID)

		payload := schema.Instance{
			Name:             "Cross-tenant instance",
			Description:      "names another organization's customer",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        toUpdate.LicenseID,
			CustomerID:       neighbourCustomer.ID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
		after := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, toUpdate.ID)
		require.Equal(t, before, after, "the instance must not be re-pointed at another organization's customer")
	})

	t.Run("WhenLicenseBelongsToAnotherOrganization_Returns404AndLeavesTheInstanceByteIdentical", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		toUpdate := instances[0]
		neighbourLicense := newLicenseIn(t, newNeighbourOrganization(t))

		const snapshotQuery = `SELECT to_jsonb(i) FROM instance i WHERE id = $1`
		before := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, toUpdate.ID)

		payload := schema.Instance{
			Name:             "Cross-tenant instance",
			Description:      "names another organization's license",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        neighbourLicense.ID,
			CustomerID:       toUpdate.CustomerID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
		after := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, toUpdate.ID)
		require.Equal(t, before, after, "the instance must not be re-pointed at another organization's license")
	})

	t.Run("WhenDeploymentZoneBelongsToAnotherOrganization_Returns404AndLeavesTheInstanceByteIdentical", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		toUpdate := instances[0]
		neighbourZone := newDeploymentZoneIn(t, newNeighbourOrganization(t))

		const snapshotQuery = `SELECT to_jsonb(i) FROM instance i WHERE id = $1`
		before := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, toUpdate.ID)

		payload := schema.Instance{
			Name:             "Cross-tenant instance",
			Description:      "names another organization's deployment zone",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata:         map[string]any{},
			LicenseID:        toUpdate.LicenseID,
			CustomerID:       toUpdate.CustomerID,
			DeploymentZoneID: &neighbourZone.ID,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/instances/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
		require.Contains(t, string(bodyBytes), "UpdateInstance.DeploymentZoneNotFound")
		after := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, toUpdate.ID)
		require.Equal(t, before, after, "the instance must not be re-pointed at another organization's deployment zone")
	})
}
