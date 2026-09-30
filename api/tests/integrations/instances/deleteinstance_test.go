package instances_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	instanceEvents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getinstance"
	instancedb "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteInstance(t *testing.T) {
	t.Run("WhenInstanceExists_HardDeletesInstance", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		toDelete := instances[0]

		// Act
		req := httptest.NewRequest("DELETE", "/api/instances/"+toDelete.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		// Verify the instance is no longer accessible via normal GetInstance
		// (which filters out soft-deleted instances)
		repo := getinstance.NewQueryRepository(instancedb.New(testServer.Dependencies.DB))
		softDeletedInstance, err := repo.GetInstance(t.Context(), toDelete.Slug, testDb.DefaultData.OrganizationID)
		require.Error(t, err)
		require.Nil(t, softDeletedInstance)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the instance deleted event
		var eventData schema.Instance
		found := false
		for _, event := range events {
			if event.EventName == instanceEvents.InstanceDeleted.Name {
				assert.Equal(t, instanceEvents.InstanceDeleted.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected INSTANCE_DELETION event to be present")

		// Verify event data contains the deleted instance information
		assert.Equal(t, toDelete.ID, eventData.ID)
	})

	t.Run("WhenInstanceDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("DELETE", "/api/instances/nonexistent-slug", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
