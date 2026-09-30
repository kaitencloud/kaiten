package featureflags_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestEvaluateFeatureFlag(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	t.Run("WhenRequestIsValid_EvaluateFlags", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		payload := schema.FeatureFlag{
			Name: "test-featureflag",
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
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.FeatureFlag](t, resp, fiber.StatusCreated)

		context := ofrep.Context{
			"targetingKey": "user-123",
		}

		body := map[string]any{
			"context": context,
		}

		req = commonfixture.NewJSONRequest(t, "POST", "/api/ofrep/v1/evaluate/flags/"+"test-featureflag", body)

		// Act
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[ofrep.EvaluationSuccess](t, resp, fiber.StatusOK)
	})

	// A saved rule runs on every evaluation of its flag, with nothing further
	// from its author. One whose loops walk the caller's context can only be
	// stopped there: the evaluation answers, quickly, from the next targeting,
	// and says which rule was stopped and why.
	t.Run("WhenASavedRuleIsTooCostlyForTheContext_ItIsStoppedAndReported", func(t *testing.T) {
		// Arrange
		t.Cleanup(resetDB)

		payload := schema.FeatureFlag{
			Name: "Looping rule",
			Type: "boolean",
			Variants: []schema.Variant{
				{Name: "enabled", Value: true},
				{Name: "disabled", Value: false},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Every triple", "items.all(a, items.all(b, items.all(c, true)))", "enabled"),
				schema.NewBasicTargeting("Everyone", "true", "disabled"),
			},
			Metadata:       map[string]any{},
			Enabled:        true,
			EventName:      "schema.test",
			Slug:           "looping-rule",
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("enabled")},
		}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", payload)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		commonfixture.AssertJSONResponse[schema.FeatureFlag](t, resp, fiber.StatusCreated)

		body := map[string]any{
			"context": ofrep.Context{"targetingKey": "user-123", "items": zeros(1000)},
		}
		req = commonfixture.NewJSONRequest(t, "POST", "/api/ofrep/v1/evaluate/flags/looping-rule", body)

		// Act
		start := time.Now()
		resp, err = testServer.App.Test(req, fiber.TestConfig{})
		elapsed := time.Since(start)
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[ofrep.EvaluationSuccess](t, resp, fiber.StatusOK)
		assert.Equal(t, "disabled", actual.Variant)
		assert.Less(t, elapsed, 2*time.Second)

		require.NotNil(t, actual.Metadata)
		reported, ok := (*actual.Metadata)[evaluator.BrokenRulesMetadataKey].([]any)
		require.True(t, ok, "the stopped rule must be reported in the flag metadata: %v", *actual.Metadata)
		require.Len(t, reported, 1)
		message, _ := reported[0].(string)
		assert.Contains(t, message, "Every triple")
		assertStoppedByTheCostLimit(t, message)
	})
}
