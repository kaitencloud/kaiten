package evaluator_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
)

func TestEvaluator_Evaluate(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name        string
		flag        schema.FeatureFlag
		ctx         openfeature.EvaluationContext
		wantReason  openfeature.Reason
		wantVariant string
	}{
		{
			name: "STATIC - basic default variant",
			flag: schema.FeatureFlag{
				Enabled: true,
				DefaultVariant: &schema.DefaultVariant{
					Type:  schema.BasicType,
					Value: schema.BasicVariant("v1"),
				},
				Variants: []schema.Variant{
					{
						Name:  "v1",
						Value: true,
					},
					{
						Name:  "v2",
						Value: false,
					},
				},
			},
			ctx: openfeature.EvaluationContext{
				TargetingKey: "user-1",
			},
			wantReason:  openfeature.ReasonStatic,
			wantVariant: "v1",
		},
		{
			name: "DEFAULT - no targeting matched",
			flag: schema.FeatureFlag{
				Enabled: true,
				Targetings: []schema.TargetingRule{
					&schema.BasicTargeting{
						Rule:    schema.Rule{Value: "user.country == 'FR'"},
						Variant: schema.BasicVariant("v1"),
					},
				},
				DefaultVariant: &schema.DefaultVariant{
					Type:  schema.BasicType,
					Value: schema.BasicVariant("default"),
				},
				Variants: []schema.Variant{
					{
						Name:  "v2",
						Value: true,
					},
					{
						Name:  "default",
						Value: false,
					},
				},
			},
			ctx: openfeature.EvaluationContext{
				TargetingKey: "user-2",
				Inputs: map[string]interface{}{
					"user": map[string]interface{}{"country": "EN"},
					"plan": "gold",
				},
			},
			wantReason:  openfeature.ReasonDefault,
			wantVariant: "default",
		},
		{
			name: "TARGETING_MATCH - basicTargeting matched",
			flag: schema.FeatureFlag{
				Enabled: true,
				Targetings: []schema.TargetingRule{
					&schema.BasicTargeting{
						Rule:    schema.Rule{Value: "user.country == 'FR'"},
						Variant: schema.BasicVariant("v3"),
					},
				},
				DefaultVariant: &schema.DefaultVariant{
					Type:  schema.BasicType,
					Value: schema.BasicVariant("default"),
				},
			},
			ctx: openfeature.EvaluationContext{
				TargetingKey: "user-3",
				Inputs: map[string]any{
					"user": map[string]any{
						"country": "FR",
					},
				},
			},
			wantReason:  openfeature.ReasonTargetingMatch,
			wantVariant: "v3",
		},
		{
			name: "SPLIT - rollout percentage targeting",
			flag: schema.FeatureFlag{
				Enabled: true,
				DefaultVariant: &schema.DefaultVariant{
					Type:  schema.BasicType,
					Value: schema.BasicVariant("A"),
				},
				Variants: []schema.Variant{
					{
						Name:  "A",
						Value: "string A",
					},
					{
						Name:  "B",
						Value: "string B",
					},
				},
				Targetings: []schema.TargetingRule{
					&schema.RolloutPercentageTargeting{
						Rule: schema.Rule{Value: "true"}, // always matched
						RolloutPercentageVariant: schema.RolloutPercentageVariant{
							RolloutPercentage: schema.RolloutPercentage{
								Distribution: map[string]int64{
									"A": 50,
									"B": 50,
								},
							},
						},
					},
				},
			},
			ctx: openfeature.EvaluationContext{
				TargetingKey: "user-4",
			},
			wantReason:  openfeature.ReasonSplit,
			wantVariant: "", // Value is pseudorandom — we’ll just check non-empty
		},
		{
			name: "DISABLED - flag disabled",
			flag: schema.FeatureFlag{
				Enabled: false,
				DefaultVariant: &schema.DefaultVariant{
					Type:  schema.BasicType,
					Value: schema.BasicVariant("off"),
				},
			},
			ctx: openfeature.EvaluationContext{
				TargetingKey: "user-5",
			},
			wantReason:  openfeature.ReasonDisabled,
			wantVariant: "off",
		},
		{
			name: "ERROR - missing targeting key",
			flag: schema.FeatureFlag{
				Enabled: true,
				DefaultVariant: &schema.DefaultVariant{
					Type:  schema.BasicType,
					Value: schema.BasicVariant("default"),
				},
				Variants: []schema.Variant{
					{
						Name:  "default",
						Value: "Default string",
					},
				},
			},
			ctx:         openfeature.EvaluationContext{}, // no targeting key
			wantReason:  openfeature.ReasonError,
			wantVariant: "default",
		},
		{
			name: "SPLIT - rollout date default variant",
			flag: schema.FeatureFlag{
				Enabled: true,
				Variants: []schema.Variant{
					{
						Name:  "early",
						Value: "Early Access",
					},
					{
						Name:  "late",
						Value: "Late Access",
					},
				},
				DefaultVariant: &schema.DefaultVariant{
					Type: schema.RolloutDateType,
					Value: &schema.RolloutDateVariant{
						RolloutDate: schema.RolloutDate{
							Start: schema.RolloutStep{
								Date:    now.Add(-1 * time.Hour),
								Variant: "early",
							},
							End: schema.RolloutStep{
								Date:    now.Add(1 * time.Hour),
								Variant: "late",
							},
						},
					},
				},
			},
			ctx: openfeature.EvaluationContext{
				TargetingKey: "user-6",
			},
			wantReason:  openfeature.ReasonSplit,
			wantVariant: "", // depends on current time — just non-empty
		},
	}

	e := evaluator.NewEvaluator()

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := e.Evaluate(t.Context(), tt.flag, tt.ctx)
			assert.NoError(t, err)
			assert.NotNil(t, got.Reason)
			assert.Equal(t, tt.wantReason, *got.Reason)

			if tt.wantVariant != "" {
				assert.Equal(t, tt.wantVariant, *got.Variant)
			} else {
				assert.NotEmpty(t, got.Value, "expected non-empty variant")
			}
		})
	}
}

// A flag with no default variant cannot come out of the database — the column
// is NOT NULL — which is exactly why all three fallback paths dereferenced it
// and only then tested it for nil, and why nobody noticed. One constructed in
// memory must fall through, not panic.
func TestEvaluator_FlagWithoutADefaultVariant(t *testing.T) {
	e := evaluator.NewEvaluator()

	flag := schema.FeatureFlag{
		Name: "No Default", Slug: "no-default", Type: "boolean", Enabled: true,
		Variants: []schema.Variant{{Name: "on", Value: true}},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Only France", "user.country == 'FR'", "on"),
		},
		DefaultVariant: nil,
	}
	ctx := openfeature.EvaluationContext{
		TargetingKey: "user-1",
		Inputs:       map[string]any{"user": map[string]any{"country": "EN"}},
	}

	details, err := e.Evaluate(t.Context(), flag, ctx)

	require.NoError(t, err)
	assert.Equal(t, false, details.Value)
	assert.Equal(t, openfeature.ReasonDefault, *details.Reason)

	// The same three paths, reached the other two ways.
	disabled := flag
	disabled.Enabled = false
	_, err = e.Evaluate(t.Context(), disabled, ctx)
	require.NoError(t, err)

	_, err = e.Evaluate(t.Context(), flag, openfeature.EvaluationContext{})
	require.NoError(t, err)
}

// When nothing resolves, the value served is the zero of the flag's declared
// type: "" would hand a boolean or number flag's caller a string its own SDK
// cannot unmarshal.
func TestEvaluator_FallbackValueMatchesTheFlagType(t *testing.T) {
	e := evaluator.NewEvaluator()

	unresolvable := func(flagType string) schema.FeatureFlag {
		return schema.FeatureFlag{
			Name: "Unresolvable", Slug: "unresolvable", Type: flagType, Enabled: true,
			Variants: []schema.Variant{{Name: "on", Value: true}},
			// Names a variant the flag does not declare.
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("gone")},
		}
	}

	for flagType, want := range map[string]any{
		"boolean": false,
		"number":  float64(0),
		"string":  "",
		"object":  map[string]any{},
	} {
		details, err := e.Evaluate(t.Context(), unresolvable(flagType), openfeature.EvaluationContext{TargetingKey: "user-1"})

		require.NoError(t, err)
		assert.Equal(t, want, details.Value, "flag type %q", flagType)
	}
}

func TestEvaluator_KillSwitch(t *testing.T) {
	e := evaluator.NewEvaluator()

	t.Run("Simple kill switch (boolean) true", func(t *testing.T) {
		flag := schema.FeatureFlag{
			Enabled: true,
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.BasicType,
				Value: schema.BasicVariant("activated"),
			},
			Variants: []schema.Variant{
				{
					Name:        "activated",
					Description: "Feature is globally activated",
					Value:       true,
				},
				{
					Name:        "deactivated",
					Description: "Feature is globally deactivated",
					Value:       false,
				},
			},
		}

		ctx := openfeature.EvaluationContext{
			TargetingKey: "user-123",
		}

		resolutionDetails, err := e.Evaluate(t.Context(), flag, ctx)

		assert.NoError(t, err)
		assert.Equal(t, true, resolutionDetails.Value)
		assert.Equal(t, "activated", *resolutionDetails.Variant)
		assert.NotNil(t, resolutionDetails.Reason)
		assert.Equal(t, openfeature.ReasonStatic, *resolutionDetails.Reason)
	})

	t.Run("Simple kill switch (boolean) false", func(t *testing.T) {
		flag := schema.FeatureFlag{
			Enabled: true,
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.BasicType,
				Value: schema.BasicVariant("deactivated"),
			},
			Variants: []schema.Variant{
				{
					Name:        "activated",
					Description: "Feature is globally activated",
					Value:       true,
				},
				{
					Name:        "deactivated",
					Description: "Feature is globally deactivated",
					Value:       false,
				},
			},
		}

		ctx := openfeature.EvaluationContext{
			TargetingKey: "user-123",
		}

		resolutionDetails, err := e.Evaluate(t.Context(), flag, ctx)

		assert.NoError(t, err)
		assert.Equal(t, false, resolutionDetails.Value)
		assert.Equal(t, "deactivated", *resolutionDetails.Variant)
		assert.NotNil(t, resolutionDetails.Reason)
		assert.Equal(t, openfeature.ReasonStatic, *resolutionDetails.Reason)
	})
}

func TestEvaluator_TargetingMatch(t *testing.T) {
	e := evaluator.NewEvaluator()

	t.Run("Targeting match with specific basicTargeting", func(t *testing.T) {
		flag := schema.FeatureFlag{
			Enabled: true,
			Targetings: []schema.TargetingRule{
				&schema.BasicTargeting{
					Rule:    schema.Rule{Value: "user.role == 'admin'"},
					Variant: schema.BasicVariant("admin-variant"),
				},
			},
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.BasicType,
				Value: schema.BasicVariant("default-variant"),
			},
			Variants: []schema.Variant{
				{
					Name:  "admin-variant",
					Value: "Admin Access",
				},
				{
					Name:  "default-variant",
					Value: "Default Access",
				},
			},
		}

		ctx := openfeature.EvaluationContext{
			TargetingKey: "user-123",
			Inputs: map[string]interface{}{
				"user": map[string]interface{}{
					"role": "admin",
				},
			},
		}

		resolutionDetails, err := e.Evaluate(t.Context(), flag, ctx)

		assert.NoError(t, err)
		assert.Equal(t, "Admin Access", resolutionDetails.Value)
		assert.Equal(t, "admin-variant", *resolutionDetails.Variant)
		assert.NotNil(t, resolutionDetails.Reason)
		assert.Equal(t, openfeature.ReasonTargetingMatch, *resolutionDetails.Reason)
	})

	t.Run("Targeting match with targeting key in array", func(t *testing.T) {
		flag := schema.FeatureFlag{
			Enabled: true,
			Targetings: []schema.TargetingRule{
				&schema.BasicTargeting{
					Rule:    schema.Rule{Value: "targetingKey in [\"user-1\", \"user-2\", \"user-3\"]"},
					Variant: schema.BasicVariant("special-variant"),
				},
			},
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.BasicType,
				Value: schema.BasicVariant("default-variant"),
			},
			Variants: []schema.Variant{
				{
					Name:  "special-variant",
					Value: "Special Access",
				},
				{
					Name:  "default-variant",
					Value: "Default Access",
				},
			},
		}

		ctx := openfeature.EvaluationContext{
			TargetingKey: "user-2",
		}

		resolutionDetails, err := e.Evaluate(t.Context(), flag, ctx)

		assert.NoError(t, err)
		assert.Equal(t, "Special Access", resolutionDetails.Value)
		assert.Equal(t, "special-variant", *resolutionDetails.Variant)
		assert.NotNil(t, resolutionDetails.Reason)
		assert.Equal(t, openfeature.ReasonTargetingMatch, *resolutionDetails.Reason)
	})
}

// TestEvaluator_InstanceContextRule covers rules over the server-side
// enriched `instance` attribute (ofrep.EnrichWithKaitenContext): registry facts
// like instance.metadata drive targeting, and every failure mode (attribute
// absent, key absent, value false) falls back to the default variant.
func TestEvaluator_InstanceContextRule(t *testing.T) {
	e := evaluator.NewEvaluator()

	flag := schema.FeatureFlag{
		Enabled: true,
		Targetings: []schema.TargetingRule{
			&schema.BasicTargeting{
				Rule:    schema.Rule{Value: "__kaiten.instance.metadata.demo == true"},
				Variant: schema.BasicVariant("on"),
			},
		},
		DefaultVariant: &schema.DefaultVariant{
			Type:  schema.BasicType,
			Value: schema.BasicVariant("off"),
		},
		Variants: []schema.Variant{
			{Name: "on", Value: true},
			{Name: "off", Value: false},
		},
	}

	instanceCtx := func(metadata map[string]interface{}) openfeature.EvaluationContext {
		return openfeature.EvaluationContext{
			TargetingKey: "00000000-0000-0000-0000-000000000042",
			Inputs: map[string]interface{}{
				"__kaiten": map[string]interface{}{
					"instance": map[string]interface{}{
						"slug":     "00000000-0000-0000-0000-000000000042",
						"metadata": metadata,
						"platform": map[string]interface{}{},
					},
				},
			},
		}
	}

	t.Run("matches when instance.metadata.demo is true", func(t *testing.T) {
		details, err := e.Evaluate(t.Context(), flag, instanceCtx(map[string]interface{}{"demo": true}))

		assert.NoError(t, err)
		assert.Equal(t, true, details.Value)
		assert.Equal(t, openfeature.ReasonTargetingMatch, *details.Reason)
	})

	t.Run("default when instance.metadata.demo is false", func(t *testing.T) {
		details, err := e.Evaluate(t.Context(), flag, instanceCtx(map[string]interface{}{"demo": false}))

		assert.NoError(t, err)
		assert.Equal(t, false, details.Value)
		assert.Equal(t, openfeature.ReasonDefault, *details.Reason)
	})

	t.Run("default when metadata has no demo key", func(t *testing.T) {
		details, err := e.Evaluate(t.Context(), flag, instanceCtx(map[string]interface{}{}))

		assert.NoError(t, err)
		assert.Equal(t, false, details.Value)
		assert.Equal(t, openfeature.ReasonDefault, *details.Reason)
	})

	t.Run("default when no instance was enriched into the context", func(t *testing.T) {
		details, err := e.Evaluate(t.Context(), flag, openfeature.EvaluationContext{TargetingKey: "user-1"})

		assert.NoError(t, err)
		assert.Equal(t, false, details.Value)
		assert.Equal(t, openfeature.ReasonDefault, *details.Reason)
	})
}

// TestEvaluator_FullKaitenContextRules covers rules over the other
// server-side enriched attributes under __kaiten: license, entitlements
// (usage vs. limit), customer, and deploymentZone — so any flag can reason
// about the full Kaiten context, not just the instance registry.
func TestEvaluator_FullKaitenContextRules(t *testing.T) {
	e := evaluator.NewEvaluator()

	kaitenCtx := func(facts map[string]interface{}) openfeature.EvaluationContext {
		return openfeature.EvaluationContext{
			TargetingKey: "instance-1",
			Inputs:       map[string]interface{}{"__kaiten": facts},
		}
	}

	t.Run("license.type gates a paid-tier flag", func(t *testing.T) {
		flag := schema.FeatureFlag{
			Enabled: true,
			Targetings: []schema.TargetingRule{
				&schema.BasicTargeting{
					Rule:    schema.Rule{Value: "__kaiten.license.type == 'PAID'"},
					Variant: schema.BasicVariant("on"),
				},
			},
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.BasicType,
				Value: schema.BasicVariant("off"),
			},
			Variants: []schema.Variant{
				{Name: "on", Value: true},
				{Name: "off", Value: false},
			},
		}

		paidCtx := kaitenCtx(map[string]interface{}{
			"license": map[string]interface{}{"slug": "scale", "type": "PAID"},
		})
		details, err := e.Evaluate(t.Context(), flag, paidCtx)
		assert.NoError(t, err)
		assert.Equal(t, true, details.Value)

		communityCtx := kaitenCtx(map[string]interface{}{
			"license": map[string]interface{}{"slug": "free", "type": "COMMUNITY"},
		})
		details, err = e.Evaluate(t.Context(), flag, communityCtx)
		assert.NoError(t, err)
		assert.Equal(t, false, details.Value)
	})

	t.Run("entitlements usage-vs-limit gates a quota flag", func(t *testing.T) {
		flag := schema.FeatureFlag{
			Enabled: true,
			Targetings: []schema.TargetingRule{
				&schema.BasicTargeting{
					Rule:    schema.Rule{Value: "__kaiten.entitlements['seats'].used < __kaiten.entitlements['seats'].limit"},
					Variant: schema.BasicVariant("on"),
				},
			},
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.BasicType,
				Value: schema.BasicVariant("off"),
			},
			Variants: []schema.Variant{
				{Name: "on", Value: true},
				{Name: "off", Value: false},
			},
		}

		// The shape here is featureflag.EntitlementFact's, flattened by the
		// same json tags ofrep marshals through — a context the server
		// actually produces, not one invented for the test.
		seats := func(used, limit float64) map[string]interface{} {
			return map[string]interface{}{
				"entitlements": map[string]interface{}{
					"seats": map[string]interface{}{
						"used":       used,
						"limit":      limit,
						"remaining":  max(limit-used, 0),
						"percentage": used / limit,
						"unlimited":  false,
					},
				},
			}
		}

		underLimit := kaitenCtx(seats(3.0, 5.0))
		details, err := e.Evaluate(t.Context(), flag, underLimit)
		assert.NoError(t, err)
		assert.Equal(t, true, details.Value)

		atLimit := kaitenCtx(seats(5.0, 5.0))
		details, err = e.Evaluate(t.Context(), flag, atLimit)
		assert.NoError(t, err)
		assert.Equal(t, false, details.Value)
	})

	t.Run("customer.domain drives a targeting rule", func(t *testing.T) {
		flag := schema.FeatureFlag{
			Enabled: true,
			Targetings: []schema.TargetingRule{
				&schema.BasicTargeting{
					Rule:    schema.Rule{Value: "__kaiten.customer.domain == 'acme.com'"},
					Variant: schema.BasicVariant("on"),
				},
			},
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.BasicType,
				Value: schema.BasicVariant("off"),
			},
			Variants: []schema.Variant{
				{Name: "on", Value: true},
				{Name: "off", Value: false},
			},
		}

		ctx := kaitenCtx(map[string]interface{}{
			"customer": map[string]interface{}{"domain": "acme.com"},
		})
		details, err := e.Evaluate(t.Context(), flag, ctx)
		assert.NoError(t, err)
		assert.Equal(t, true, details.Value)
	})

	t.Run("deploymentZone.type and currentReleaseId drive a targeting rule", func(t *testing.T) {
		flag := schema.FeatureFlag{
			Enabled: true,
			Targetings: []schema.TargetingRule{
				&schema.BasicTargeting{
					Rule:    schema.Rule{Value: "__kaiten.deploymentZone.type == 'production' && __kaiten.deploymentZone.currentReleaseId == 'rel-1'"},
					Variant: schema.BasicVariant("on"),
				},
			},
			DefaultVariant: &schema.DefaultVariant{
				Type:  schema.BasicType,
				Value: schema.BasicVariant("off"),
			},
			Variants: []schema.Variant{
				{Name: "on", Value: true},
				{Name: "off", Value: false},
			},
		}

		matching := kaitenCtx(map[string]interface{}{
			"deploymentZone": map[string]interface{}{"type": "production", "currentReleaseId": "rel-1"},
		})
		details, err := e.Evaluate(t.Context(), flag, matching)
		assert.NoError(t, err)
		assert.Equal(t, true, details.Value)

		// No zone assigned to the instance — EnrichWithInstanceFacts leaves
		// deploymentZone out of the context entirely; the rule must fail to
		// match, not error.
		noZone := kaitenCtx(map[string]interface{}{})
		details, err = e.Evaluate(t.Context(), flag, noZone)
		assert.NoError(t, err)
		assert.Equal(t, false, details.Value)
		assert.Equal(t, openfeature.ReasonDefault, *details.Reason)
	})
}
