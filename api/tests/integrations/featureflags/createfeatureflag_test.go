package featureflags_test

import (
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	featureflagEvents "github.com/kaitencloud/kaiten/api/internal/modules/featureflags/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateFeatureFlag(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenRequestIsValid_CreatesFeatureFlag", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		payload := schema.FeatureFlag{
			Name: "Test featureflag",
			Type: "boolean",
			Variants: []schema.Variant{
				{
					Name:        "enabled",
					Value:       true,
					Description: "This variant enables the feature",
				},
				{
					Name:        "disabled",
					Value:       false,
					Description: "This variant disables the feature",
				},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Enabled", "true", "enabled"),
				schema.NewRolloutDateTargeting("Gradual Rollout", "user.role == 'admin'", &schema.RolloutStep{
					Variant:    "disabled",
					Percentage: 0,
					Date:       time.Now(),
				}, &schema.RolloutStep{
					Variant:    "disabled",
					Percentage: 100,
					Date:       time.Now().AddDate(0, 1, 0),
				}),
				schema.NewRolloutPercentageTargeting("A/B Test", "true", map[string]int64{
					"enabled":  70,
					"disabled": 30,
				}),
			},
			Description:    nil,
			Metadata:       map[string]any{},
			Enabled:        true,
			EventName:      "schema.test",
			Slug:           "test-featureflag",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("disabled")},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.FeatureFlag](t, resp, fiber.StatusCreated)
		require.Equal(t, "Test featureflag", actual.Name)
		require.Equal(t, "boolean", actual.Type)
		require.Len(t, actual.Variants, 2)
		require.Equal(t, "enabled", actual.Variants[0].Name)
		require.Equal(t, true, actual.Variants[0].Value)
		require.Equal(t, "disabled", actual.Variants[1].Name)
		require.Equal(t, false, actual.Variants[1].Value)
		require.Len(t, actual.Targetings, len(payload.Targetings))

		rule, ok := actual.Targetings[0].(*schema.BasicTargeting)
		require.True(t, ok)
		actualRule, ok := payload.Targetings[0].(*schema.BasicTargeting)
		require.True(t, ok)
		require.Equal(t, schema.BasicType, rule.Type)
		require.Equal(t, actualRule.Name, rule.Name)
		require.Equal(t, actualRule.GetRule().Value, rule.GetRule().Value)
		require.Equal(t, actualRule.Variant, rule.Variant)

		rolloutDate, ok := actual.Targetings[1].(*schema.RolloutDateTargeting)
		require.True(t, ok)
		actualRolloutDate, ok := payload.Targetings[1].(*schema.RolloutDateTargeting)
		require.True(t, ok)
		require.Equal(t, schema.RolloutDateType, rolloutDate.Type)
		require.Equal(t, actualRolloutDate.Name, rolloutDate.Name)
		require.Equal(t, actualRolloutDate.GetRule().Value, rolloutDate.GetRule().Value)
		require.Equal(t, actualRolloutDate.Start.Variant, rolloutDate.Start.Variant)
		require.Equal(t, actualRolloutDate.Start.Percentage, rolloutDate.Start.Percentage)
		require.True(t, actualRolloutDate.Start.Date.Truncate(time.Second).Equal(rolloutDate.Start.Date.Truncate(time.Second)))
		require.Equal(t, actualRolloutDate.End.Variant, rolloutDate.End.Variant)
		require.Equal(t, actualRolloutDate.End.Percentage, rolloutDate.End.Percentage)
		require.True(t, actualRolloutDate.End.Date.Truncate(time.Second).Equal(rolloutDate.End.Date.Truncate(time.Second)))

		rolloutPercentage, ok := actual.Targetings[2].(*schema.RolloutPercentageTargeting)
		require.True(t, ok)
		actualRolloutPercentage, ok := payload.Targetings[2].(*schema.RolloutPercentageTargeting)
		require.True(t, ok)
		require.Equal(t, schema.RolloutPercentageType, rolloutPercentage.Type)
		require.Equal(t, actualRolloutPercentage.Name, rolloutPercentage.Name)
		require.Equal(t, actualRolloutPercentage.GetRule().Value, rolloutPercentage.GetRule().Value)
		require.Equal(t, actualRolloutPercentage.Distribution, rolloutPercentage.Distribution)
		require.Equal(t, "schema.test", actual.EventName)

		// Verify outbox event was created
		events := commonfixture.ListOutboxEvents(t, testServer.Dependencies.DB, testDb.DefaultData.OrganizationID)
		require.NotEmpty(t, events, "Expected at least one outbox event")

		// Find the feature flag created event
		var eventData schema.FeatureFlag
		found := false
		for _, event := range events {
			if event.EventName == featureflagEvents.FeatureFlagCreated.Name {
				assert.Equal(t, featureflagEvents.FeatureFlagCreated.Type, event.EventType)
				err = json.Unmarshal(event.Data, &eventData)
				require.NoError(t, err)
				found = true
				break
			}
		}
		require.True(t, found, "Expected FEATUREFLAG_CREATION event to be present")

		// Verify event data contains the created feature flag
		assert.Equal(t, actual.ID, eventData.ID)
		assert.Equal(t, actual.Name, eventData.Name)
		assert.Equal(t, actual.Type, eventData.Type)
		assert.Equal(t, actual.Slug, eventData.Slug)
		assert.Equal(t, actual.EventName, eventData.EventName)
	})

	t.Run("WhenDefaultVariantIsRolloutPercentageWithDistributionAtRoot_CreatesFeatureFlag", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		payload := schema.FeatureFlag{
			Name: "UI theme",
			Type: "string",
			Variants: []schema.Variant{
				{
					Name:        "theme_a",
					Value:       "class-a",
					Description: "",
				},
				{
					Name:        "theme_b",
					Value:       "class-b",
					Description: "",
				},
			},
			Targetings:  schema.Targetings{},
			Description: nil,
			Metadata:    map[string]any{},
			Enabled:     true,
			EventName:   "schema.test",
			Slug:        "ui-theme",
			DefaultVariant: &schema.DefaultVariant{
				Type: schema.RolloutPercentageType,
				Value: &schema.RolloutPercentageVariant{RolloutPercentage: schema.RolloutPercentage{
					Distribution: map[string]int64{"theme_a": 50, "theme_b": 50},
				}},
			},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[schema.FeatureFlag](t, resp, fiber.StatusCreated)
		require.Equal(t, "ui-theme", actual.Slug)
		require.NotNil(t, actual.DefaultVariant)
		require.Equal(t, string(schema.RolloutPercentageType), string(actual.DefaultVariant.Type))
	})

	// A rule whose own loops would be stopped on every evaluation is refused
	// when the flag is saved, rather than saved to never match.
	t.Run("WhenATargetingRuleIsTooCostlyToEvaluate_RefusesTheFlag", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		payload := schema.FeatureFlag{
			Name: "Costly rule",
			Type: "boolean",
			Variants: []schema.Variant{
				{Name: "enabled", Value: true},
				{Name: "disabled", Value: false},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Every triple", literalLoops(100, 3), "enabled"),
			},
			Metadata:       map[string]any{},
			Enabled:        true,
			Slug:           "costly-rule",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("disabled")},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", payload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
		body, err := io.ReadAll(resp.Body)
		require.NoError(t, err)
		assert.Contains(t, string(body), "could cost up to")

		var stored int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
			`SELECT COUNT(*) FROM feature_flags WHERE organization_id = $1 AND slug = $2`,
			testDb.DefaultData.OrganizationID, payload.Slug).Scan(&stored))
		assert.Zero(t, stored, "the refused flag must not be written")
	})
}
