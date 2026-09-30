package evaluator_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
)

// The point of gating on a flag is that the flag can say no. All three used to
// return a constant, so the three FlagGate call sites proved nothing. `plan` is
// injected server-side from the caller's licence, so these rules judge a fact
// the client cannot forge.
func TestCustomerFlagsDiscriminate(t *testing.T) {
	newDashboard := schema.FeatureFlag{
		Name: "New Dashboard", Slug: "new-dashboard", Type: "boolean", Enabled: true,
		Variants: []schema.Variant{{Name: "enabled", Value: true}, {Name: "disabled", Value: false}},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting(
				"Paid tiers", "__kaiten.license.slug in ['starter', 'growth', 'scale']", "enabled",
			),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type: schema.BasicType, Value: schema.BasicVariant("disabled"),
		},
	}
	prioritySupport := schema.FeatureFlag{
		Name: "Priority Support", Slug: "priority-support", Type: "boolean", Enabled: true,
		Variants: []schema.Variant{{Name: "enabled", Value: true}, {Name: "disabled", Value: false}},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting(
				"Scale tier, or nearly out of room",
				"__kaiten.license.slug == 'scale' || __kaiten.entitlements['customers'].percentage >= 0.9",
				"enabled",
			),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type: schema.BasicType, Value: schema.BasicVariant("disabled"),
		},
	}

	// The shape EnrichWithServerFacts injects, so these rules are exercised
	// against the context they will really see.
	variantFor := func(flag schema.FeatureFlag, plan string, fullness float64) string {
		ctx := openfeature.EvaluationContext{
			TargetingKey: "dogfooding-abc",
			Inputs: map[string]any{
				"__kaiten": map[string]any{
					"license": map[string]any{"slug": plan, "type": "PAID"},
					"entitlements": map[string]any{
						"customers": map[string]any{"percentage": fullness},
					},
				},
			},
		}
		details, err := evaluator.NewEvaluator().Evaluate(t.Context(), flag, ctx)
		assert.NoError(t, err)
		return *details.Variant
	}

	// Two real tenants, two different answers on the same page.
	assert.Equal(t, "enabled", variantFor(newDashboard, "starter", 0.1))
	assert.Equal(t, "enabled", variantFor(newDashboard, "growth", 0.1))
	assert.Equal(t, "disabled", variantFor(newDashboard, "beta-tester", 0.1),
		"the unlimited internal licence must not get the paid-tier feature")

	assert.Equal(t, "enabled", variantFor(prioritySupport, "scale", 0.1))
	assert.Equal(t, "disabled", variantFor(prioritySupport, "growth", 0.1))

	// The entitlement half of the rule: the same starter tenant flips to
	// enabled on usage alone, which is the targeting a plan slug cannot express.
	assert.Equal(t, "disabled", variantFor(prioritySupport, "starter", 0.5))
	assert.Equal(t, "enabled", variantFor(prioritySupport, "starter", 0.92))
}
