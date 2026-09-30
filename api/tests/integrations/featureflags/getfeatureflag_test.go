package featureflags_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetFeatureFlag(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenFeatureFlagExists_ReturnsFeatureFlag", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		createPayload := schema.FeatureFlag{
			Name: "Test featureflag",
			Type: "boolean",
			Variants: []schema.Variant{
				{Name: "enabled", Value: true, Description: "This variant enables the feature"},
				{Name: "disabled", Value: false, Description: "This variant disables the feature"},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Enabled", "true", "enabled"),
			},
			Description:    nil,
			Metadata:       map[string]any{},
			Enabled:        true,
			EventName:      "schema.test",
			Slug:           "test-featureflag",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("disabled")},
		}
		createReq := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", createPayload)

		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)

		created := commonfixture.AssertJSONResponse[schema.FeatureFlag](t, createResp, fiber.StatusCreated)

		// Act
		req := httptest.NewRequest("GET", "/api/feature-flags/test-featureflag", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.FeatureFlag](t, resp, fiber.StatusOK)
		require.Equal(t, created.ID, actual.ID)
		require.Equal(t, created.Name, actual.Name)
		require.Equal(t, created.Type, actual.Type)
		require.Equal(t, created.Slug, actual.Slug)
		require.Equal(t, created.EventName, actual.EventName)
		require.Equal(t, created.Enabled, actual.Enabled)
		require.Len(t, actual.Variants, 2)
		require.Equal(t, "enabled", actual.Variants[0].Name)
		require.Equal(t, "disabled", actual.Variants[1].Name)
		require.Len(t, actual.Targetings, 1)
	})

	t.Run("WhenFeatureFlagDoesNotExist_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		// Act
		req := httptest.NewRequest("GET", "/api/feature-flags/non-existent-slug", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenFeatureFlagHasComplexTargetings_ReturnsAllTargetings", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		createPayload := schema.FeatureFlag{
			Name: "Complex featureflag",
			Type: "boolean",
			Variants: []schema.Variant{
				{Name: "enabled", Value: true, Description: "Enabled variant"},
				{Name: "disabled", Value: false, Description: "Disabled variant"},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Basic rule", "user.role == 'admin'", "enabled"),
				schema.NewRolloutPercentageTargeting("A/B Test", "true", map[string]int64{
					"enabled":  70,
					"disabled": 30,
				}),
			},
			Description:    nil,
			Metadata:       map[string]any{"team": "platform"},
			Enabled:        true,
			EventName:      "schema.complex",
			Slug:           "complex-featureflag",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("disabled")},
		}
		createReq := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", createPayload)

		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)

		commonfixture.AssertJSONResponse[schema.FeatureFlag](t, createResp, fiber.StatusCreated)

		// Act
		req := httptest.NewRequest("GET", "/api/feature-flags/complex-featureflag", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.FeatureFlag](t, resp, fiber.StatusOK)
		require.Equal(t, "Complex featureflag", actual.Name)
		require.Len(t, actual.Targetings, 2)

		// Verify basic targeting
		basicTargeting, ok := actual.Targetings[0].(*schema.BasicTargeting)
		require.True(t, ok, "First targeting should be BasicTargeting")
		require.Equal(t, "Basic rule", basicTargeting.Name)
		require.Equal(t, "user.role == 'admin'", basicTargeting.GetRule().Value)
		require.Equal(t, "enabled", string(basicTargeting.Variant))

		// Verify rollout percentage targeting
		rolloutTargeting, ok := actual.Targetings[1].(*schema.RolloutPercentageTargeting)
		require.True(t, ok, "Second targeting should be RolloutPercentageTargeting")
		require.Equal(t, "A/B Test", rolloutTargeting.Name)
		require.Equal(t, int64(70), rolloutTargeting.Distribution["enabled"])
		require.Equal(t, int64(30), rolloutTargeting.Distribution["disabled"])
	})

	t.Run("WhenStoredMetadataIsNull_ReturnsEmptyObject", func(t *testing.T) {
		// Arrange: the demo seed built its flags without metadata, and the
		// create repository stored that nil map as the JSON null. HTTP input
		// always carries an object, so the row is set to null directly.
		t.Cleanup(resetDB)

		createPayload := schema.FeatureFlag{
			Name: "Loyalty offer",
			Type: "boolean",
			Variants: []schema.Variant{
				{Name: "on", Value: true, Description: "Reward granted"},
				{Name: "off", Value: false, Description: "No reward"},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Returning customers", "true", "on"),
			},
			Metadata:       map[string]any{},
			Enabled:        true,
			EventName:      "loyalty-offer.evaluated",
			Slug:           "loyalty-offer",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("off")},
		}
		createReq := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", createPayload)

		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)

		commonfixture.AssertJSONResponse[schema.FeatureFlag](t, createResp, fiber.StatusCreated)

		_, err = testDb.DbPool.Exec(t.Context(), `UPDATE feature_flags SET metadata = 'null'::jsonb WHERE slug = $1`, "loyalty-offer")
		require.NoError(t, err)

		// Act
		req := httptest.NewRequest("GET", "/api/feature-flags/loyalty-offer", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert: an object, as the contract declares, and never null.
		actual := commonfixture.AssertJSONResponse[map[string]json.RawMessage](t, resp, fiber.StatusOK)
		require.JSONEq(t, `{}`, string(actual["metadata"]))
	})
}
