package licenses_test

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlement"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	licensesschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestUpdateLicenseEntitlement(t *testing.T) {
	t.Run("WhenNumberEntitlement_UpdatesThreshold", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		newLicenseEntitlementWithThreshold(t, licenses[0].Slug, entitlement.Slug, 10)
		payload := licensesschema.LicenseEntitlement{
			Value: map[string]any{
				"type":  "number",
				"value": 20,
			},
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+licenses[0].Slug+"/entitlements/"+entitlement.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.Value["type"], updated.Value["type"])
		require.EqualValues(t, payload.Value["value"], updated.Value["value"])
		require.Equal(t, "NUMBER", updated.EntitlementType)

		// Verify outbox event was created
		outboxEvents := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, outboxEvents, "Expected at least one outbox event")

		// Find the license entitlement updated event
		var eventData licensesschema.LicenseEntitlement
		found := false
		for _, event := range outboxEvents {
			if event.EventName == events.LicenseEntitlementUpdated.Name {
				assert.Equal(t, events.LicenseEntitlementUpdated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected LICENSE_ENTITLEMENT_UPDATE event to be present")

		// Verify event data contains the updated license entitlement
		assert.Equal(t, licenses[0].ID, eventData.LicenseID)
		assert.Equal(t, entitlement.Slug, eventData.EntitlementSlug)
		assert.Equal(t, payload.Value["type"], eventData.Value["type"])
		assert.EqualValues(t, payload.Value["value"], eventData.Value["value"])
	})

	t.Run("WhenBooleanEntitlement_UpdatesEnabled", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Boolean)
		newLicenseEntitlementWithEnabled(t, licenses[0].Slug, entitlement.Slug, false)
		payload := licensesschema.LicenseEntitlement{
			Value: map[string]any{
				"type":  "boolean",
				"value": true,
			},
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+licenses[0].Slug+"/entitlements/"+entitlement.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.EqualValues(t, true, updated.Value["value"])
		require.Equal(t, "BOOLEAN", updated.EntitlementType)

		// Verify outbox event was created
		outboxEvents := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, outboxEvents, "Expected at least one outbox event")

		// Find the license entitlement updated event
		var eventData licensesschema.LicenseEntitlement
		found := false
		for _, event := range outboxEvents {
			if event.EventName == events.LicenseEntitlementUpdated.Name {
				assert.Equal(t, events.LicenseEntitlementUpdated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected LICENSE_ENTITLEMENT_UPDATE event to be present")

		// Verify event data contains the updated license entitlement
		assert.Equal(t, licenses[0].ID, eventData.LicenseID)
		assert.Equal(t, entitlement.Slug, eventData.EntitlementSlug)
		assert.EqualValues(t, true, eventData.Value["value"])
	})

	t.Run("WhenBooleanEntitlementDisabled_UpdatesCorrectly", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Boolean)
		newLicenseEntitlementWithEnabled(t, licenses[0].Slug, entitlement.Slug, true)
		payload := licensesschema.LicenseEntitlement{
			Value: map[string]any{
				"type":  "boolean",
				"value": false,
			},
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+licenses[0].Slug+"/entitlements/"+entitlement.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.EqualValues(t, false, updated.Value["value"])
	})

	t.Run("WhenConfigEntitlement_UpdatesObjectValue", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Config)
		newLicenseEntitlementWithConfig(t, licenses[0].Slug, entitlement.Slug, map[string]any{"timeout": "10s"})
		updatedConfig := map[string]any{"timeout": "60s", "maxRetries": 5}
		payload := licensesschema.LicenseEntitlement{
			Value: map[string]any{
				"type":  "object",
				"value": updatedConfig,
			},
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+licenses[0].Slug+"/entitlements/"+entitlement.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		updated, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, "object", updated.Value["type"])
		require.Equal(t, "CONFIG", updated.EntitlementType)

		storedConfig, ok := updated.Value["value"].(map[string]any)
		require.True(t, ok, "Expected value to be a map")
		require.EqualValues(t, updatedConfig["timeout"], storedConfig["timeout"])
		require.EqualValues(t, updatedConfig["maxRetries"], storedConfig["maxRetries"])

		// Verify outbox event was created
		outboxEvents := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, outboxEvents, "Expected at least one outbox event")

		// Find the license entitlement updated event
		var eventData licensesschema.LicenseEntitlement
		found := false
		for _, event := range outboxEvents {
			if event.EventName == events.LicenseEntitlementUpdated.Name {
				assert.Equal(t, events.LicenseEntitlementUpdated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected LICENSE_ENTITLEMENT_UPDATE event to be present")

		// Verify event data contains the updated license entitlement
		assert.Equal(t, licenses[0].ID, eventData.LicenseID)
		assert.Equal(t, entitlement.Slug, eventData.EntitlementSlug)
		assert.Equal(t, "object", eventData.Value["type"])
	})

	t.Run("WhenLicenseEntitlementDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			Value: map[string]any{
				"type":  "number",
				"value": 20,
			},
		}
		req := commonfixture.NewJSONRequest(t, "PUT", "/api/licenses/"+licenses[0].Slug+"/entitlements/"+entitlement.Slug, payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		bodyString := string(bodyBytes)
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		require.Contains(t, bodyString, "UpdateLicenseEntitlement.NotFound")
	})
}
