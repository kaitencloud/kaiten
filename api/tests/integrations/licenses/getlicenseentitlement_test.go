package licenses_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	entitlementsschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	licensesschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetLicenseEntitlementByEntitlementID(t *testing.T) {
	t.Run("WhenLicenseEntitlementExistsForEntitlement_ReturnLicenseEntitlement", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		newLicenseEntitlementWithThreshold(t, licenses[0].Slug, entitlement.Slug, 10)
		req := httptest.NewRequest("GET", "/api/licenses/"+licenses[0].Slug+"/entitlements/"+entitlement.Slug, nil)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		commonfixture.AssertJSONResponse[licensesschema.License](t, resp, fiber.StatusOK)
	})

	t.Run("WhenLicenseEntitlementDoesNotExistsForEntitlement_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		req := httptest.NewRequest("GET", "/api/licenses/"+licenses[0].Slug+"/entitlements/"+entitlement.Slug, nil)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		bodyString := string(bodyBytes)
		require.Contains(t, bodyString, "GetLicenseEntitlement.NotFound")
	})
}
