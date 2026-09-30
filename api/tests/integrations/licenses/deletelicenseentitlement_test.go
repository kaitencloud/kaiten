package licenses_test

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/getlicenseentitlement"
	licensesdb "github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	licensesschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteLicenseEntitlement(t *testing.T) {
	t.Run("WhenRequestIsValid_DeleteLicenseEntitlement", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		newLicenseEntitlementWithThreshold(t, licenses[0].Slug, entitlement.Slug, 10)
		req := commonfixture.NewJSONRequest(t, "DELETE", "/api/licenses/"+licenses[0].Slug+"/entitlements/"+entitlement.Slug, nil)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		licenseEntitlement, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.Nil(t, licenseEntitlement)
		require.Error(t, err)

		// Verify outbox event was created
		outboxEvents := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, outboxEvents, "Expected at least one outbox event")

		// Find the license entitlement unassigned event
		var eventData licensesschema.LicenseEntitlement
		found := false
		for _, event := range outboxEvents {
			if event.EventName == events.LicenseEntitlementUnassigned.Name {
				assert.Equal(t, events.LicenseEntitlementUnassigned.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected LICENSE_ENTITLEMENT_UNASSIGNMENT event to be present")

		// Verify event data contains the unassigned license entitlement
		assert.Equal(t, licenses[0].ID, eventData.LicenseID)
		assert.Equal(t, entitlement.Slug, eventData.EntitlementSlug)
	})

	t.Run("WhenLicenceEntitlementDoesNotExists_Return404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		req := commonfixture.NewJSONRequest(t, "DELETE", "/api/licenses/"+licenses[0].Slug+"/entitlements/"+entitlement.Slug, nil)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		bodyString := string(bodyBytes)
		require.Contains(t, bodyString, "DeleteLicenseEntitlement.LicenseEntitlementNotFound")
	})

	t.Run("WhenLicenseDoesNotExists_Return404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		req := commonfixture.NewJSONRequest(t, "DELETE", "/api/licenses/"+uuid.New().String()+"/entitlements/"+entitlement.Slug, nil)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		bodyString := string(bodyBytes)
		require.Contains(t, bodyString, "DeleteLicenseEntitlement.LicenseEntitlementNotFound")
	})

	t.Run("WhenEntitlementDoesNotExists_Return404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		req := commonfixture.NewJSONRequest(t, "DELETE", "/api/licenses/"+licenses[0].Slug+"/entitlements/"+uuid.New().String(), nil)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		bodyString := string(bodyBytes)
		require.Contains(t, bodyString, "DeleteLicenseEntitlement.LicenseEntitlementNotFound")
	})
}
