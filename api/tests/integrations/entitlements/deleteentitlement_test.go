package entitlements_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlement"
	entitlementsdb "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteEntitlement(t *testing.T) {
	t.Run("WhenEntitlementExists_DeletesEntitlement", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlements := createEntitlements(t, 1)
		toDelete := entitlements[0]

		// Act
		req := httptest.NewRequest("DELETE", "/api/entitlements/"+toDelete.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		_, err = repo.GetEntitlement(t.Context(), toDelete.Slug, testDb.DefaultData.OrganizationID)
		require.Error(t, err)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the entitlement deleted event
		var eventData schema.Entitlement
		found := false
		for _, event := range events {
			if event.EventName == entitlementEvents.EntitlementDeleted.Name {
				assert.Equal(t, entitlementEvents.EntitlementDeleted.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected ENTITLEMENT_DELETION event to be present")

		// Verify event data contains the deleted entitlement information
		assert.Equal(t, toDelete.ID, eventData.ID)
	})

	t.Run("WhenEntitlementDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("DELETE", "/api/entitlements/nonexistent-slug", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
