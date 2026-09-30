package featureflags_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/openfeature/ofrep"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestBulkEvaluateFeatureFlags(t *testing.T) {
	resetDB := func() {
		require.NoError(t, testDb.Reset())
	}

	// seedFlag creates a feature flag via the API.
	seedFlag := func(t *testing.T, ff schema.FeatureFlag) schema.FeatureFlag {
		t.Helper()
		req := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags", ff)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		return commonfixture.AssertJSONResponse[schema.FeatureFlag](t, resp, fiber.StatusCreated)
	}

	// bulkEval posts to the OFREP bulk endpoint and returns raw response.
	bulkEval := func(t *testing.T, ctx ofrep.Context) *ofrep.BulkEvaluationSuccess {
		t.Helper()
		body := map[string]any{"context": ctx}
		req := commonfixture.NewJSONRequest(t, "POST", "/api/ofrep/v1/evaluate/flags", body)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)
		result := commonfixture.AssertJSONResponse[ofrep.BulkEvaluationSuccess](t, resp, fiber.StatusOK)
		return &result
	}

	t.Run("WhenNoFlagsExist_ReturnsEmptyFlagsArray", func(t *testing.T) {
		t.Cleanup(resetDB)

		result := bulkEval(t, ofrep.Context{"targetingKey": "user-1"})

		require.NotNil(t, result)
		require.Empty(t, result.Flags)
	})

	t.Run("WhenOneFlagExists_ReturnsSingleEvaluation", func(t *testing.T) {
		t.Cleanup(resetDB)

		seedFlag(t, schema.FeatureFlag{
			Name: "Kill Switch", Slug: "kill-switch", Type: "boolean",
			Variants: []schema.Variant{
				{Name: "enabled", Value: true},
				{Name: "disabled", Value: false},
			},
			Targetings:     schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("enabled")},
			Metadata:       map[string]any{},
			Enabled:        true, EventName: "ff.kill_switch",
		})

		result := bulkEval(t, ofrep.Context{"targetingKey": "user-42"})

		require.Len(t, result.Flags, 1)
	})

	t.Run("WhenMultipleFlagsExist_ReturnsAllEvaluations", func(t *testing.T) {
		t.Cleanup(resetDB)

		seedFlag(t, schema.FeatureFlag{
			Name: "Boolean Flag", Slug: "bool-flag", Type: "boolean",
			Variants:       []schema.Variant{{Name: "on", Value: true}, {Name: "off", Value: false}},
			Targetings:     schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("on")},
			Metadata:       map[string]any{}, Enabled: true, EventName: "ff.bool",
		})
		seedFlag(t, schema.FeatureFlag{
			Name: "String Flag", Slug: "str-flag", Type: "string",
			Variants:       []schema.Variant{{Name: "v1", Value: "one"}, {Name: "v2", Value: "two"}},
			Targetings:     schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("v1")},
			Metadata:       map[string]any{}, Enabled: true, EventName: "ff.str",
		})
		seedFlag(t, schema.FeatureFlag{
			Name: "Number Flag", Slug: "num-flag", Type: "number",
			Variants:       []schema.Variant{{Name: "low", Value: float64(10)}, {Name: "high", Value: float64(100)}},
			Targetings:     schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("low")},
			Metadata:       map[string]any{}, Enabled: true, EventName: "ff.num",
		})

		result := bulkEval(t, ofrep.Context{"targetingKey": "user-99"})

		require.Len(t, result.Flags, 3)
	})

	t.Run("WhenFlagIsDisabled_ReturnsDisabledReason", func(t *testing.T) {
		t.Cleanup(resetDB)

		seedFlag(t, schema.FeatureFlag{
			Name: "Off Flag", Slug: "off-flag", Type: "boolean",
			Variants:       []schema.Variant{{Name: "on", Value: true}, {Name: "off", Value: false}},
			Targetings:     schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("off")},
			Metadata:       map[string]any{},
			Enabled:        false, // disabled
			EventName:      "ff.off",
		})

		result := bulkEval(t, ofrep.Context{"targetingKey": "user-1"})

		require.Len(t, result.Flags, 1)
		// Each flag evaluation is serialised as map[string]any by the bulk handler
		flagMap, ok := result.Flags[0].(map[string]any)
		require.True(t, ok)
		require.Equal(t, "DISABLED", flagMap["reason"])
	})

	t.Run("WhenTargetingKeyMatchesBasicRule_ReturnsMatchedVariant", func(t *testing.T) {
		t.Cleanup(resetDB)

		seedFlag(t, schema.FeatureFlag{
			Name: "Admin Flag", Slug: "admin-flag", Type: "boolean",
			Variants: []schema.Variant{
				{Name: "admin-on", Value: true, Description: "Admin access enabled"},
				{Name: "default-off", Value: false, Description: "No admin access"},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Admin rule", "user.role == 'admin'", "admin-on"),
			},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("default-off")},
			Metadata:       map[string]any{}, Enabled: true, EventName: "ff.admin",
		})

		// Evaluate with an admin targeting context
		result := bulkEval(t, ofrep.Context{
			"targetingKey": "admin-user",
			"user":         map[string]any{"role": "admin"},
		})

		require.Len(t, result.Flags, 1)
		flagMap, ok := result.Flags[0].(map[string]any)
		require.True(t, ok)
		require.Equal(t, "admin-on", flagMap["variant"])
		require.Equal(t, "TARGETING_MATCH", flagMap["reason"])
	})

	t.Run("WhenNoTargetingKeyProvided_FlagsAreStillReturned", func(t *testing.T) {
		// The bulk handler uses OFREP Context which may have no targetingKey.
		// Flags without a targeting key get ReasonError per the evaluator, but
		// the bulk handler still returns all flags (no hard failure).
		t.Cleanup(resetDB)

		seedFlag(t, schema.FeatureFlag{
			Name: "Any Flag", Slug: "any-flag", Type: "boolean",
			Variants:       []schema.Variant{{Name: "on", Value: true}, {Name: "off", Value: false}},
			Targetings:     schema.Targetings{},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("on")},
			Metadata:       map[string]any{}, Enabled: true, EventName: "ff.any",
		})

		body := map[string]any{"context": map[string]any{}} // no targetingKey
		req := commonfixture.NewJSONRequest(t, "POST", "/api/ofrep/v1/evaluate/flags", body)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		result := commonfixture.AssertJSONResponse[ofrep.BulkEvaluationSuccess](t, resp, fiber.StatusOK)
		require.Len(t, result.Flags, 1)
	})

	t.Run("WhenRolloutPercentageTargeting_ReturnsValidVariant", func(t *testing.T) {
		t.Cleanup(resetDB)

		seedFlag(t, schema.FeatureFlag{
			Name: "AB Test Flag", Slug: "ab-test-flag", Type: "boolean",
			Variants: []schema.Variant{
				{Name: "variant-a", Value: true},
				{Name: "variant-b", Value: false},
			},
			Targetings: schema.Targetings{
				schema.NewRolloutPercentageTargeting(
					"50/50 split", "true", // "true" ensures the rule always matches
					map[string]int64{"variant-a": 50, "variant-b": 50},
				),
			},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("variant-a")},
			Metadata:       map[string]any{}, Enabled: true, EventName: "ff.ab_test",
		})

		result := bulkEval(t, ofrep.Context{"targetingKey": "user-split-test"})

		require.Len(t, result.Flags, 1)
		flagMap, ok := result.Flags[0].(map[string]any)
		require.True(t, ok)
		variant, _ := flagMap["variant"].(string)
		require.Contains(t, []string{"variant-a", "variant-b"}, variant)
		require.Equal(t, "SPLIT", flagMap["reason"])
	})

	t.Run("WhenRolloutDateTargetingIsActive_ReturnsSplitReason", func(t *testing.T) {
		t.Cleanup(resetDB)

		now := time.Now()
		seedFlag(t, schema.FeatureFlag{
			Name: "Rollout Date Flag", Slug: "rollout-date-flag", Type: "string",
			Variants: []schema.Variant{
				{Name: "early", Value: "early-value"},
				{Name: "full", Value: "full-value"},
			},
			Targetings: schema.Targetings{
				schema.NewRolloutDateTargeting(
					"Gradual rollout", "true", // "true" ensures the rule always matches
					&schema.RolloutStep{Variant: "early", Percentage: 0, Date: now.Add(-2 * time.Hour)},
					&schema.RolloutStep{Variant: "full", Percentage: 100, Date: now.Add(2 * time.Hour)},
				),
			},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("early")},
			Metadata:       map[string]any{}, Enabled: true, EventName: "ff.rollout_date",
		})

		result := bulkEval(t, ofrep.Context{"targetingKey": "user-rollout"})

		require.Len(t, result.Flags, 1)
		flagMap, ok := result.Flags[0].(map[string]any)
		require.True(t, ok)
		require.Equal(t, "SPLIT", flagMap["reason"])
		require.NotEmpty(t, flagMap["variant"])
	})
}
