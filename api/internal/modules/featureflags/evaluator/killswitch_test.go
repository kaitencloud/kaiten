package evaluator_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
)

// A kill switch has to say both things, and the always-true rule is what the
// toggle controls. Neither half of the default can do it: an enabled flag with
// no matching rule falls through to its default, and a DISABLED flag resolves to
// that same default -- so a default of "off" never turns on, and a default of
// "on" shows while the switch is off.
func TestKillSwitchAnswersBothPositions(t *testing.T) {
	flag := func(enabled bool) schema.FeatureFlag {
		return schema.FeatureFlag{
			Name: "Maintenance Mode", Slug: "maintenance-mode", Type: "boolean",
			Enabled: enabled,
			Variants: []schema.Variant{
				{Name: "on", Value: true}, {Name: "off", Value: false},
			},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Everyone", "true", "on"),
			},
			DefaultVariant: &schema.DefaultVariant{
				Type: schema.BasicType, Value: schema.BasicVariant("off"),
			},
			Metadata: map[string]any{"severity": "critical"},
		}
	}
	ctx := openfeature.EvaluationContext{TargetingKey: "dogfooding-abc", Inputs: map[string]any{}}

	off, err := evaluator.NewEvaluator().Evaluate(t.Context(), flag(false), ctx)
	assert.NoError(t, err)
	assert.Equal(t, ptr.To("off"), off.Variant, "a disabled kill switch must be off")

	on, err := evaluator.NewEvaluator().Evaluate(t.Context(), flag(true), ctx)
	assert.NoError(t, err)
	assert.Equal(t, ptr.To("on"), on.Variant, "enabling it must actually reach the banner")
}
