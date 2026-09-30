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
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestAssociateEntitlementWithLicense(t *testing.T) {
	t.Run("WhenNumberEntitlement_AssociatesWithThreshold", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug: entitlement.Slug,
			Value: map[string]any{
				"type":  "number",
				"value": 10,
			},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		expected, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, expected)
		require.Equal(t, payload.Value["type"], expected.Value["type"])
		require.EqualValues(t, payload.Value["value"], expected.Value["value"])
		require.Equal(t, licenses[0].ID, expected.LicenseID)
		require.Equal(t, "NUMBER", expected.EntitlementType)

		// Verify outbox event was created
		outboxEvents := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, outboxEvents, "Expected at least one outbox event")

		// Find the license entitlement assigned event
		var eventData licensesschema.LicenseEntitlement
		found := false
		for _, event := range outboxEvents {
			if event.EventName == events.LicenseEntitlementAssigned.Name {
				assert.Equal(t, events.LicenseEntitlementAssigned.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected LICENSE_ENTITLEMENT_ASSIGNMENT event to be present")

		// Verify event data contains the association information
		assert.Equal(t, licenses[0].ID, eventData.LicenseID)
		assert.Equal(t, entitlement.Slug, eventData.EntitlementSlug)
		assert.Equal(t, payload.Value["type"], eventData.Value["type"])
		assert.EqualValues(t, payload.Value["value"], eventData.Value["value"])
	})

	t.Run("WhenBooleanEntitlement_AssociatesWithEnabled", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Boolean)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug: entitlement.Slug,
			Value: map[string]any{
				"type":  "boolean",
				"value": true,
			},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		expected, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, expected)
		require.Equal(t, payload.Value["type"], expected.Value["type"])
		require.EqualValues(t, payload.Value["value"], expected.Value["value"])
		require.Equal(t, licenses[0].ID, expected.LicenseID)
		require.Equal(t, "BOOLEAN", expected.EntitlementType)

		// Verify outbox event was created
		outboxEvents := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, outboxEvents, "Expected at least one outbox event")

		// Find the license entitlement assigned event
		var eventData licensesschema.LicenseEntitlement
		found := false
		for _, event := range outboxEvents {
			if event.EventName == events.LicenseEntitlementAssigned.Name {
				assert.Equal(t, events.LicenseEntitlementAssigned.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected LICENSE_ENTITLEMENT_ASSIGNMENT event to be present")

		// Verify event data contains the association information
		assert.Equal(t, licenses[0].ID, eventData.LicenseID)
		assert.Equal(t, entitlement.Slug, eventData.EntitlementSlug)
		assert.Equal(t, payload.Value["type"], eventData.Value["type"])
		assert.EqualValues(t, payload.Value["value"], eventData.Value["value"])
	})

	t.Run("WhenBooleanEntitlementDisabled_AssociatesCorrectly", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Boolean)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug: entitlement.Slug,
			Value: map[string]any{
				"type":  "boolean",
				"value": false,
			},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		expected, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, expected)
		require.EqualValues(t, false, expected.Value["value"])
		require.Equal(t, "BOOLEAN", expected.EntitlementType)
	})

	t.Run("WhenConfigEntitlement_AssociatesWithObjectValue", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Config)
		configValue := map[string]any{"maxRetries": 3, "timeout": "30s"}
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug: entitlement.Slug,
			Value: map[string]any{
				"type":  "object",
				"value": configValue,
			},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		expected, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, expected)
		require.Equal(t, "object", expected.Value["type"])
		require.Equal(t, licenses[0].ID, expected.LicenseID)
		require.Equal(t, "CONFIG", expected.EntitlementType)

		storedConfig, ok := expected.Value["value"].(map[string]any)
		require.True(t, ok, "Expected value to be a map")
		require.EqualValues(t, configValue["maxRetries"], storedConfig["maxRetries"])
		require.EqualValues(t, configValue["timeout"], storedConfig["timeout"])

		// Verify outbox event was created
		outboxEvents := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, outboxEvents, "Expected at least one outbox event")

		// Find the license entitlement assigned event
		var eventData licensesschema.LicenseEntitlement
		found := false
		for _, event := range outboxEvents {
			if event.EventName == events.LicenseEntitlementAssigned.Name {
				assert.Equal(t, events.LicenseEntitlementAssigned.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected LICENSE_ENTITLEMENT_ASSIGNMENT event to be present")

		// Verify event data contains the association information
		assert.Equal(t, licenses[0].ID, eventData.LicenseID)
		assert.Equal(t, entitlement.Slug, eventData.EntitlementSlug)
		assert.Equal(t, "object", eventData.Value["type"])
	})

	t.Run("WhenLicenseDoesNotExists_Return404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug: entitlement.Slug,
			Value: map[string]any{
				"type":  "number",
				"value": 10,
			},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+uuid.New().String()+"/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		bodyString := string(bodyBytes)
		require.Contains(t, bodyString, "AssociateEntitlementToLicense.LicenseNotFound")
	})

	t.Run("WhenEntitlementDoesNotExists_Return404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug: uuid.New().String(),
			Value: map[string]any{
				"type":  "number",
				"value": 10,
			},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		bodyString := string(bodyBytes)
		require.Contains(t, bodyString, "AssociateEntitlementToLicense.EntitlementNotFound")
	})

	t.Run("WhenAlreadyAssociated_Return409", func(t *testing.T) {
		// Arrange
		// A second association would give the license two rows for the same
		// entitlement, and the enforcement path reads the threshold with a
		// single-row lookup -- so the applied cap would become whichever
		// row Postgres happened to return.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug: entitlement.Slug,
			Value: map[string]any{
				"type":  "number",
				"value": 10,
			},
		}

		firstReq := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)
		firstResp, err := testServer.App.Test(firstReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, firstResp.Body)
		require.Equal(t, http.StatusNoContent, firstResp.StatusCode)

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, http.StatusConflict, resp.StatusCode)
		bodyBytes, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		require.Contains(t, string(bodyBytes), "AssociateEntitlementToLicense.AlreadyAssociated")

		var count int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(), `
			SELECT COUNT(*) FROM license_entitlement
			WHERE license_id = $1 AND entitlement_id = $2
		`, licenses[0].ID, entitlement.ID).Scan(&count))
		require.Equal(t, 1, count)
	})
}

// TestAssociateEntitlementWithLicense_LimitCapExceededOveragePercent covers
// the invariant that couples a NUMBER grant's value to its
// limitCapExceededOveragePercent: unlimited (-1) requires exactly -1, a
// limited value requires >= 0, and the field is meaningless (and rejected)
// for non-numeric grants.
func TestAssociateEntitlementWithLicense_LimitCapExceededOveragePercent(t *testing.T) {
	t.Run("WhenUnlimitedValueWithMatchingOveragePercent_Accepts", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug:                entitlement.Slug,
			Value:                          map[string]any{"type": "number", "value": -1},
			LimitCapExceededOveragePercent: ptr.To(int32(-1)),
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, stored.LimitCapExceededOveragePercent)
		require.EqualValues(t, -1, *stored.LimitCapExceededOveragePercent)
	})

	t.Run("WhenUnlimitedValueWithNonMatchingOveragePercent_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug:                entitlement.Slug,
			Value:                          map[string]any{"type": "number", "value": -1},
			LimitCapExceededOveragePercent: ptr.To(int32(10)),
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("WhenLimitedValueWithNegativeOveragePercentOtherThanUnlimited_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug:                entitlement.Slug,
			Value:                          map[string]any{"type": "number", "value": 100},
			LimitCapExceededOveragePercent: ptr.To(int32(-5)),
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("WhenLimitedValueWithZeroOveragePercent_AcceptsAsHardLimit", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug:                entitlement.Slug,
			Value:                          map[string]any{"type": "number", "value": 100},
			LimitCapExceededOveragePercent: ptr.To(int32(0)),
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, stored.LimitCapExceededOveragePercent)
		require.EqualValues(t, 0, *stored.LimitCapExceededOveragePercent)
	})

	t.Run("WhenLimitedValueWithPositiveOveragePercent_AcceptsAsSoftLimit", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug:                entitlement.Slug,
			Value:                          map[string]any{"type": "number", "value": 100},
			LimitCapExceededOveragePercent: ptr.To(int32(20)),
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, stored.LimitCapExceededOveragePercent)
		require.EqualValues(t, 20, *stored.LimitCapExceededOveragePercent)
	})

	t.Run("WhenValueOmitted_DefaultsToHardForALimitedValue", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug: entitlement.Slug,
			Value:           map[string]any{"type": "number", "value": 100},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, stored.LimitCapExceededOveragePercent)
		require.EqualValues(t, 0, *stored.LimitCapExceededOveragePercent)
	})

	t.Run("WhenValueOmitted_DefaultsToUnlimitedForAnUnlimitedValue", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Number)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug: entitlement.Slug,
			Value:           map[string]any{"type": "number", "value": -1},
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, http.StatusNoContent, resp.StatusCode)
		repo := getlicenseentitlement.NewQueryRepository(licensesdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetLicenseEntitlement(t.Context(), licenses[0].Slug, entitlement.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, stored.LimitCapExceededOveragePercent)
		require.EqualValues(t, -1, *stored.LimitCapExceededOveragePercent)
	})

	t.Run("WhenBooleanEntitlementWithOveragePercent_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		licenses := newLicenses(t, 1)
		entitlement := newEntitlementWithType(t, entitlementsschema.Boolean)
		payload := licensesschema.LicenseEntitlement{
			EntitlementSlug:                entitlement.Slug,
			Value:                          map[string]any{"type": "boolean", "value": true},
			LimitCapExceededOveragePercent: ptr.To(int32(0)),
		}

		req := commonfixture.NewJSONRequest(t, "POST", "/api/licenses/"+licenses[0].Slug+"/entitlements", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
