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

	t.Run("WhenEntitlementIsGrantedByALicense_Returns409AndKeepsIt", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newGroupUsageInstance(t)
		granted := createEntitlements(t, 1)[0]
		assignGroupUsageEntitlementToLicense(t, instance.LicenseSlug, granted.Slug, 10)

		// Act
		req := httptest.NewRequest("DELETE", "/api/entitlements/"+granted.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusConflict, resp.StatusCode)
		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		_, err = repo.GetEntitlement(t.Context(), granted.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err, "a refused delete must leave the entitlement in place")
	})

	// Usage is a counter of the entitlement, so it goes with it. Before
	// 20261012000000_entitlement_usage_follows_its_entitlement.sql an entitlement
	// anything had ever been reported against could not be deleted at all.
	t.Run("WhenEntitlementHasUsageButNoGrant_DeletesItWithItsUsage", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instance := newGroupUsageInstance(t)
		used := createEntitlements(t, 1)[0]
		seedGroupUsageRow(t, instance.ID, used.ID, 3, 3, nil)

		// Act
		req := httptest.NewRequest("DELETE", "/api/entitlements/"+used.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		var remaining int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
			`SELECT count(*) FROM entitlement_usage WHERE entitlement_id = $1`, used.ID).Scan(&remaining))
		assert.Zero(t, remaining, "the entitlement's usage must be deleted with it")
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
