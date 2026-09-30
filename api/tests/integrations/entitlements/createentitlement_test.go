package entitlements_test

import (
	"encoding/json"
	"io"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/getentitlement"
	entitlementsdb "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateEntitlement(t *testing.T) {
	t.Run("WhenNumberEntitlement_CreatesWithAggregation", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:              "Test Entitlement",
			Description:       ptr.To("Test Description"),
			Type:              ptr.To(schema.Number),
			AggregationMethod: ptr.To(schema.Average),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.Equal(t, *payload.Description, *created.Description)
		require.Equal(t, payload.Type, created.Type)
		require.Equal(t, payload.AggregationMethod, created.AggregationMethod)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, created.Name, stored.Name)
		require.Equal(t, *created.Description, *stored.Description)
		require.Equal(t, created.Type, stored.Type)
		require.Equal(t, created.AggregationMethod, stored.AggregationMethod)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the entitlement created event
		var eventData schema.Entitlement
		found := false
		for _, event := range events {
			if event.EventName == entitlementEvents.EntitlementCreated.Name {
				assert.Equal(t, entitlementEvents.EntitlementCreated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected ENTITLEMENT_CREATION event to be present")

		// Verify event data contains the created entitlement
		assert.Equal(t, created.ID, eventData.ID)
		assert.Equal(t, created.Name, eventData.Name)
		assert.Equal(t, *created.Description, *eventData.Description)
		assert.Equal(t, created.Type, eventData.Type)
		assert.Equal(t, created.AggregationMethod, eventData.AggregationMethod)
	})

	t.Run("WhenBooleanEntitlement_CreatesWithoutAggregationMethod", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:        "Boolean Feature",
			Description: ptr.To("A boolean entitlement"),
			Type:        ptr.To(schema.Boolean),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.Equal(t, schema.Boolean, *created.Type)
		require.Nil(t, created.AggregationMethod)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, schema.Boolean, *stored.Type)
		require.Nil(t, stored.AggregationMethod)
	})

	t.Run("WhenConfigEntitlement_CreatesWithoutAggregationMethod", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:        "Config Feature",
			Description: ptr.To("A config entitlement"),
			Type:        ptr.To(schema.Config),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.Name, created.Name)
		require.Equal(t, schema.Config, *created.Type)
		require.Nil(t, created.AggregationMethod)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, schema.Config, *stored.Type)
		require.Nil(t, stored.AggregationMethod)
	})

	t.Run("WhenNumberWithoutAggregationMethod_DefaultsToSum", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name: "Calculated Metric",
			Type: ptr.To(schema.Number),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, schema.Number, *created.Type)
		require.Equal(t, ptr.To(schema.Sum), created.AggregationMethod)
	})

	t.Run("WhenGroupSlugsAreProvided_AssociatesEntitlementWithGroups", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		createEntitlementGroup(t, "Usage", "usage")
		createEntitlementGroup(t, "Security", "security")

		payload := schema.Entitlement{
			Name:       "Grouped entitlement",
			Type:       ptr.To(schema.Boolean),
			GroupSlugs: []string{"security", "usage"},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Len(t, created.EntitlementGroups, 2)
		assert.ElementsMatch(t, []string{"security", "usage"}, []string{
			created.EntitlementGroups[0].Slug,
			created.EntitlementGroups[1].Slug,
		})

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Len(t, stored.EntitlementGroups, 2)
		assert.ElementsMatch(t, []string{"security", "usage"}, []string{
			stored.EntitlementGroups[0].Slug,
			stored.EntitlementGroups[1].Slug,
		})
	})

	t.Run("WhenNumberEntitlementWithUnits_CreatesAndEmitsUnits", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:              "Seats",
			Type:              ptr.To(schema.Number),
			AggregationMethod: ptr.To(schema.Sum),
			UnitSingular:      ptr.To("seat"),
			UnitPlural:        ptr.To("seats"),
			SaleUnitSingular:  ptr.To("pack"),
			SaleUnitPlural:    ptr.To("packs"),
			SaleUnitFactor:    ptr.To(3.0),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.UnitSingular, created.UnitSingular)
		require.Equal(t, payload.UnitPlural, created.UnitPlural)
		require.Equal(t, payload.SaleUnitSingular, created.SaleUnitSingular)
		require.Equal(t, payload.SaleUnitPlural, created.SaleUnitPlural)
		require.Equal(t, payload.SaleUnitFactor, created.SaleUnitFactor)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Equal(t, payload.UnitSingular, stored.UnitSingular)
		require.Equal(t, payload.UnitPlural, stored.UnitPlural)
		require.Equal(t, payload.SaleUnitSingular, stored.SaleUnitSingular)
		require.Equal(t, payload.SaleUnitPlural, stored.SaleUnitPlural)
		require.Equal(t, payload.SaleUnitFactor, stored.SaleUnitFactor)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		var eventData schema.Entitlement
		found := false
		for _, event := range events {
			if event.EventName == entitlementEvents.EntitlementCreated.Name {
				require.NoError(t, json.Unmarshal(event.Data, &eventData))
				found = true
				break
			}
		}
		require.True(t, found, "Expected ENTITLEMENT_CREATION event to be present")
		assert.Equal(t, payload.UnitSingular, eventData.UnitSingular)
		assert.Equal(t, payload.UnitPlural, eventData.UnitPlural)
		assert.Equal(t, payload.SaleUnitSingular, eventData.SaleUnitSingular)
		assert.Equal(t, payload.SaleUnitPlural, eventData.SaleUnitPlural)
		assert.Equal(t, payload.SaleUnitFactor, eventData.SaleUnitFactor)
	})

	t.Run("WhenNumberEntitlementWithBaseUnitsOnly_Creates", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:              "Requests",
			Type:              ptr.To(schema.Number),
			AggregationMethod: ptr.To(schema.Sum),
			UnitSingular:      ptr.To("request"),
			UnitPlural:        ptr.To("requests"),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.Equal(t, payload.UnitSingular, created.UnitSingular)
		require.Equal(t, payload.UnitPlural, created.UnitPlural)
		require.Nil(t, created.SaleUnitSingular)
		require.Nil(t, created.SaleUnitPlural)
		require.Nil(t, created.SaleUnitFactor)
	})

	t.Run("WhenSaleUnitsWithoutBaseUnits_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:              "Seats",
			Type:              ptr.To(schema.Number),
			AggregationMethod: ptr.To(schema.Sum),
			SaleUnitSingular:  ptr.To("pack"),
			SaleUnitPlural:    ptr.To("packs"),
			SaleUnitFactor:    ptr.To(3.0),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("WhenUnitPairIncomplete_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:              "Seats",
			Type:              ptr.To(schema.Number),
			AggregationMethod: ptr.To(schema.Sum),
			UnitSingular:      ptr.To("seat"),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("WhenUnitsOnBooleanEntitlement_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:         "Boolean Feature",
			Type:         ptr.To(schema.Boolean),
			UnitSingular: ptr.To("seat"),
			UnitPlural:   ptr.To("seats"),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("WhenSaleUnitFactorNotPositive_Returns422", func(t *testing.T) {
		// exclusiveMinimum is enforced by the schema layer before the handler runs,
		// hence 422 rather than the handler's 400.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		for _, factor := range []float64{0, -1} {
			payload := schema.Entitlement{
				Name:              "Seats",
				Type:              ptr.To(schema.Number),
				AggregationMethod: ptr.To(schema.Sum),
				UnitSingular:      ptr.To("seat"),
				UnitPlural:        ptr.To("seats"),
				SaleUnitSingular:  ptr.To("pack"),
				SaleUnitPlural:    ptr.To("packs"),
				SaleUnitFactor:    ptr.To(factor),
			}
			req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, resp.Body)

			require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
		}
	})

	t.Run("WhenUserFacingProvided_CreatesUserFacing", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:       "Public Feature",
			Type:       ptr.To(schema.Boolean),
			UserFacing: ptr.To(true),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.UserFacing)
		require.True(t, *created.UserFacing)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, stored.UserFacing)
		require.True(t, *stored.UserFacing)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		var eventData schema.Entitlement
		found := false
		for _, event := range events {
			if event.EventName == entitlementEvents.EntitlementCreated.Name {
				require.NoError(t, json.Unmarshal(event.Data, &eventData))
				found = true
				break
			}
		}
		require.True(t, found, "Expected ENTITLEMENT_CREATION event to be present")
		require.NotNil(t, eventData.UserFacing)
		assert.True(t, *eventData.UserFacing)
	})

	t.Run("WhenUserFacingOmitted_DefaultsToFalse", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name: "Internal Feature",
			Type: ptr.To(schema.Boolean),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.UserFacing)
		require.False(t, *created.UserFacing)
	})

	t.Run("WhenDisplayOrderProvided_CreatesWithDisplayOrder", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:         "Ordered Feature",
			Type:         ptr.To(schema.Boolean),
			DisplayOrder: ptr.To(int32(42)),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.DisplayOrder)
		require.Equal(t, int32(42), *created.DisplayOrder)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, stored.DisplayOrder)
		require.Equal(t, int32(42), *stored.DisplayOrder)

		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)

		var eventData schema.Entitlement
		found := false
		for _, event := range events {
			if event.EventName == entitlementEvents.EntitlementCreated.Name {
				require.NoError(t, json.Unmarshal(event.Data, &eventData))
				found = true
				break
			}
		}
		require.True(t, found, "Expected ENTITLEMENT_CREATION event to be present")
		require.NotNil(t, eventData.DisplayOrder)
		assert.Equal(t, int32(42), *eventData.DisplayOrder)
	})

	t.Run("WhenDisplayOrderOmitted_DefaultsToZero", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name: "Unordered Feature",
			Type: ptr.To(schema.Boolean),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.DisplayOrder)
		require.Equal(t, int32(0), *created.DisplayOrder)
	})

	t.Run("WhenDisplayOrderNegative_Returns422", func(t *testing.T) {
		// minimum:"0" is enforced by the schema layer before the handler runs.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:         "Bad Order",
			Type:         ptr.To(schema.Boolean),
			DisplayOrder: ptr.To(int32(-1)),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenNameIsEmpty_Returns422", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:        "",
			Description: ptr.To("Missing a name"),
			Type:        ptr.To(schema.Boolean),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenWarningThresholdProvided_CreatesWithPolicy", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:                    "Metered Feature",
			Type:                    ptr.To(schema.Number),
			WarningThresholdPercent: ptr.To(int32(80)),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.WarningThresholdPercent)
		require.Equal(t, int32(80), *created.WarningThresholdPercent)

		repo := getentitlement.NewQueryRepository(entitlementsdb.New(testServer.Dependencies.DB))
		stored, err := repo.GetEntitlement(t.Context(), created.Slug, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.NotNil(t, stored.WarningThresholdPercent)
		require.Equal(t, int32(80), *stored.WarningThresholdPercent)
	})

	t.Run("WhenWarningThresholdOmitted_DefaultsToDisabled", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name: "Metered Feature",
			Type: ptr.To(schema.Number),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		created := commonfixture.AssertJSONResponse[schema.Entitlement](t, resp, fiber.StatusCreated)
		require.NotNil(t, created.WarningThresholdPercent)
		require.Equal(t, int32(0), *created.WarningThresholdPercent)
	})

	t.Run("WhenWarningThresholdPercentOutOfRange_Returns422", func(t *testing.T) {
		// maximum:"100" is enforced by the schema layer before the handler runs,
		// hence 422 rather than the handler's 400 (same pattern as
		// WhenSaleUnitFactorNotPositive_Returns422 above).
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:                    "Metered Feature",
			Type:                    ptr.To(schema.Number),
			WarningThresholdPercent: ptr.To(int32(101)),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	})

	t.Run("WhenWarningThresholdPercentOnBooleanEntitlement_Returns400", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		payload := schema.Entitlement{
			Name:                    "Boolean Feature",
			Type:                    ptr.To(schema.Boolean),
			WarningThresholdPercent: ptr.To(int32(50)),
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", payload)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}

// The contract makes `type` optional, so omitting it is a conformant request
// and the 422 it gets back has to be a well-formed problem document.
func TestCreateEntitlementWithoutType(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	req := commonfixture.NewJSONRequest(t, "POST", "/api/entitlements", map[string]any{
		"name":        "No Type",
		"description": "type omitted, which the contract allows",
	})

	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	require.Equal(t, fiber.StatusUnprocessableEntity, resp.StatusCode)
	require.Contains(t, resp.Header.Get("Content-Type"), "application/problem+json")

	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.NotContains(t, string(raw), "null", "a nil error must never reach the wire")

	var problem apierrors.Problem
	require.NoError(t, json.Unmarshal(raw, &problem))
	assert.Equal(t, "CreateEntitlement.TypeRequired", problem.Code)
	assert.Equal(t, "type is required", problem.Detail)
	assert.Empty(t, problem.Errors)
}
