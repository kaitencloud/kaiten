package entitlements_test

import (
	"encoding/json"
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

func TestUpdateEntitlement(t *testing.T) {
	t.Run("WhenRequestIsValid_UpdatesEntitlement", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlements := createEntitlements(t, 1)
		toUpdate := entitlements[0]
		payload := map[string]any{
			"name":        "Test Entitlement updated",
			"description": "Test Description",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload["name"], updated.Name)
		require.NotNil(t, updated.Description)
		require.Equal(t, payload["description"], *updated.Description)
		require.Equal(t, toUpdate.Type, updated.Type)
		require.Equal(t, toUpdate.AggregationMethod, updated.AggregationMethod)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the entitlement updated event
		var eventData schema.Entitlement
		found := false
		for _, event := range events {
			if event.EventName == entitlementEvents.EntitlementUpdated.Name {
				assert.Equal(t, entitlementEvents.EntitlementUpdated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected ENTITLEMENT_UPDATE event to be present")

		// Verify event data contains the updated entitlement
		assert.Equal(t, toUpdate.ID, eventData.ID)
		assert.Equal(t, payload["name"], eventData.Name)
		assert.Equal(t, payload["description"], *eventData.Description)
		assert.Equal(t, toUpdate.Type, eventData.Type)
		assert.Equal(t, toUpdate.AggregationMethod, eventData.AggregationMethod)
	})

	t.Run("WhenUpdatingUnits_MutatesUnits", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := createNumberEntitlementWithUnits(t, "seats-mutate")
		payload := map[string]any{
			"name":             toUpdate.Name,
			"description":      "Seats entitlement",
			"unitSingular":     "siège",
			"unitPlural":       "sièges",
			"saleUnitSingular": "bundle",
			"saleUnitPlural":   "bundles",
			"saleUnitFactor":   5.0,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.UnitSingular)
		require.Equal(t, "siège", *updated.UnitSingular)
		require.NotNil(t, updated.UnitPlural)
		require.Equal(t, "sièges", *updated.UnitPlural)
		require.NotNil(t, updated.SaleUnitSingular)
		require.Equal(t, "bundle", *updated.SaleUnitSingular)
		require.NotNil(t, updated.SaleUnitPlural)
		require.Equal(t, "bundles", *updated.SaleUnitPlural)
		require.NotNil(t, updated.SaleUnitFactor)
		require.Equal(t, 5.0, *updated.SaleUnitFactor)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		var eventData schema.Entitlement
		found := false
		for _, event := range events {
			if event.EventName == entitlementEvents.EntitlementUpdated.Name {
				require.NoError(t, json.Unmarshal(event.Data, &eventData))
				found = true
				break
			}
		}
		require.True(t, found, "Expected ENTITLEMENT_UPDATE event to be present")
		require.NotNil(t, eventData.SaleUnitFactor)
		assert.Equal(t, 5.0, *eventData.SaleUnitFactor)
		require.NotNil(t, eventData.UnitSingular)
		assert.Equal(t, "siège", *eventData.UnitSingular)
	})

	t.Run("WhenUpdateOmitsUnits_ClearsUnits", func(t *testing.T) {
		// PUT is full-replace: omitting the unit fields clears them, like icon.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := createNumberEntitlementWithUnits(t, "seats-clear")
		payload := map[string]any{
			"name":        toUpdate.Name,
			"description": "Seats entitlement",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Nil(t, updated.UnitSingular)
		require.Nil(t, updated.UnitPlural)
		require.Nil(t, updated.SaleUnitSingular)
		require.Nil(t, updated.SaleUnitPlural)
		require.Nil(t, updated.SaleUnitFactor)
	})

	t.Run("WhenRenameResendsUnits_KeepsUnits", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		toUpdate := createNumberEntitlementWithUnits(t, "seats-rename")
		payload := map[string]any{
			"name":             "Renamed seats",
			"description":      "Seats entitlement",
			"unitSingular":     *toUpdate.UnitSingular,
			"unitPlural":       *toUpdate.UnitPlural,
			"saleUnitSingular": *toUpdate.SaleUnitSingular,
			"saleUnitPlural":   *toUpdate.SaleUnitPlural,
			"saleUnitFactor":   *toUpdate.SaleUnitFactor,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, "Renamed seats", updated.Name)
		require.Equal(t, toUpdate.UnitSingular, updated.UnitSingular)
		require.Equal(t, toUpdate.UnitPlural, updated.UnitPlural)
		require.Equal(t, toUpdate.SaleUnitSingular, updated.SaleUnitSingular)
		require.Equal(t, toUpdate.SaleUnitPlural, updated.SaleUnitPlural)
		require.Equal(t, toUpdate.SaleUnitFactor, updated.SaleUnitFactor)
	})

	t.Run("WhenAddingUnitsToBooleanEntitlement_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlements := createEntitlements(t, 1)
		toUpdate := entitlements[0]
		payload := map[string]any{
			"name":         toUpdate.Name,
			"description":  "Boolean entitlement",
			"unitSingular": "seat",
			"unitPlural":   "seats",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("WhenUpdatingUserFacing_MutatesIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlements := createEntitlements(t, 1)
		toUpdate := entitlements[0]

		payload := map[string]any{
			"name":        toUpdate.Name,
			"description": "Test Description",
			"userFacing":  true,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.UserFacing)
		require.True(t, *updated.UserFacing)

		// PUT is full-replace: omitting userFacing resets it to false.
		payload = map[string]any{
			"name":        toUpdate.Name,
			"description": "Test Description",
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		updated, err = repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.UserFacing)
		require.False(t, *updated.UserFacing)
	})

	t.Run("WhenUpdatingDisplayOrder_MutatesIt", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlements := createEntitlements(t, 1)
		toUpdate := entitlements[0]

		payload := map[string]any{
			"name":         toUpdate.Name,
			"description":  "Test Description",
			"displayOrder": 7,
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.DisplayOrder)
		require.Equal(t, int32(7), *updated.DisplayOrder)

		// PUT is full-replace: omitting displayOrder resets it to 0.
		payload = map[string]any{
			"name":        toUpdate.Name,
			"description": "Test Description",
		}
		req = commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		updated, err = repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, updated.DisplayOrder)
		require.Equal(t, int32(0), *updated.DisplayOrder)
	})

	t.Run("WhenEntitlementDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := map[string]any{
			"name":        "Test Entitlement updated",
			"description": "Test Description",
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/nonexistent-slug", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenGroupSlugsAreProvided_ReplacesEntitlementGroups", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		entitlements := createEntitlements(t, 1)
		toUpdate := entitlements[0]
		createEntitlementGroup(t, "Usage", "usage")
		createEntitlementGroup(t, "Security", "security")
		addEntitlementToGroup(t, "usage", toUpdate.Slug)

		payload := map[string]any{
			"name":        toUpdate.Name,
			"description": toUpdate.Description,
			"groupSlugs":  []string{"security"},
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/entitlements/"+toUpdate.Slug, payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetEntitlement(t.Context(), toUpdate.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Len(t, updated.EntitlementGroups, 1)
		require.Equal(t, "security", updated.EntitlementGroups[0].Slug)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		var eventData schema.Entitlement
		found := false
		for _, event := range events {
			if event.EventName == entitlementEvents.EntitlementUpdated.Name {
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected ENTITLEMENT_UPDATE event to be present")
		require.Len(t, eventData.EntitlementGroups, 1)
		require.Equal(t, "security", eventData.EntitlementGroups[0].Slug)
	})
}
