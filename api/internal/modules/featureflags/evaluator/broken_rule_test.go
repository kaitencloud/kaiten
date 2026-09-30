package evaluator_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
)

// A rule that cannot run and a rule that says no must not be the same branch,
// or a typo in a targeting rule silently never enables the feature. The value
// served must not change — one bad rule must not fail a bulk evaluation — but it
// must leave a trace.
func TestABrokenRuleIsReported(t *testing.T) {
	flag := schema.FeatureFlag{
		Name: "Priority Support", Slug: "priority-support", Type: "boolean", Enabled: true,
		Variants: []schema.Variant{{Name: "enabled", Value: true}, {Name: "disabled", Value: false}},
		Targetings: schema.Targetings{
			// `__kaiten` is not in the context below: the reference cannot resolve.
			schema.NewBasicTargeting(
				"Nearly out of room", "__kaiten.entitlements['seats'].percentage >= 0.9", "enabled",
			),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type: schema.BasicType, Value: schema.BasicVariant("disabled"),
		},
		Metadata: map[string]any{"team": "support"},
	}

	details, err := evaluator.NewEvaluator().Evaluate(t.Context(), flag, openfeature.EvaluationContext{
		TargetingKey: "dogfooding-abc",
		Inputs:       map[string]any{},
	})
	assert.NoError(t, err)

	// Availability is unchanged: the flag still resolves, on its default.
	assert.Equal(t, "disabled", *details.Variant)

	// And the failure is readable by whoever wrote the rule.
	metadata := *details.FlagMetadata
	reported, ok := metadata[evaluator.BrokenRulesMetadataKey].([]string)
	assert.True(t, ok, "the broken rule must be reported in the flag metadata")
	assert.Len(t, reported, 1)
	assert.Contains(t, reported[0], "Nearly out of room")

	// The flag's own metadata survives alongside it.
	assert.Equal(t, "support", metadata["team"])
}

func TestAWorkingRuleReportsNothing(t *testing.T) {
	flag := schema.FeatureFlag{
		Name: "New Dashboard", Slug: "new-dashboard", Type: "boolean", Enabled: true,
		Variants: []schema.Variant{{Name: "enabled", Value: true}, {Name: "disabled", Value: false}},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Paid tiers", "__kaiten.license.slug == 'growth'", "enabled"),
		},
		DefaultVariant: &schema.DefaultVariant{
			Type: schema.BasicType, Value: schema.BasicVariant("disabled"),
		},
	}

	details, err := evaluator.NewEvaluator().Evaluate(t.Context(), flag, openfeature.EvaluationContext{
		TargetingKey: "dogfooding-abc",
		Inputs:       map[string]any{"__kaiten": map[string]any{"license": map[string]any{"slug": "growth"}}},
	})
	assert.NoError(t, err)

	assert.Equal(t, "enabled", *details.Variant)
	if details.FlagMetadata != nil {
		assert.NotContains(t, *details.FlagMetadata, evaluator.BrokenRulesMetadataKey)
	}
}

// loopingFlag is a flag whose first targeting loops three deep over the
// caller's `items`, and whose second matches everyone.
func loopingFlag() schema.FeatureFlag {
	return schema.FeatureFlag{
		Name: "Everyone", Slug: "everyone", Type: "boolean", Enabled: true,
		Variants: []schema.Variant{{Name: "enabled", Value: true}, {Name: "disabled", Value: false}},
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Every triple", "items.all(a, items.all(b, items.all(c, true)))", "enabled"),
			schema.NewBasicTargeting("Everyone", "true", "disabled"),
		},
		DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("enabled")},
	}
}

// itemsContext carries n items, enough for loopingFlag's first rule to iterate
// n³ times.
func itemsContext(n int) openfeature.EvaluationContext {
	items := make([]any, n)
	for i := range items {
		items[i] = 0.0
	}

	return openfeature.EvaluationContext{TargetingKey: "user-1", Inputs: map[string]any{"items": items}}
}

/*
TestARuleStoppedByTheBoundsIsReportedAndSkipped is the amplification the bounds
close: a saved rule runs on every evaluation of its flag, with nothing further
from its author, and this one would iterate 27 million times on each.

Stopped, it is a broken rule like any other: the flag moves on to its next
targeting, and the author can read why in the metadata.
*/
func TestARuleStoppedByTheBoundsIsReportedAndSkipped(t *testing.T) {
	start := time.Now()
	details, err := evaluator.NewEvaluator().Evaluate(t.Context(), loopingFlag(), itemsContext(300))
	elapsed := time.Since(start)

	require.NoError(t, err)
	assert.Less(t, elapsed, time.Second)

	// The next targeting answered.
	assert.Equal(t, "disabled", *details.Variant)
	assert.Equal(t, "Everyone", *details.MatchedRuleName)

	reported, ok := (*details.FlagMetadata)[evaluator.BrokenRulesMetadataKey].([]string)
	require.True(t, ok, "the stopped rule must be reported in the flag metadata")
	require.Len(t, reported, 1)
	assert.Contains(t, reported[0], "Every triple")
	assert.Contains(t, reported[0], featureflag.ErrRuleTooCostly.Error())
}

// The rules run under the request's context: once the caller has gone, a rule
// that loops is interrupted instead of run to its bound — and reported as
// interrupted, not as too costly.
func TestACancelledRequestStopsItsRules(t *testing.T) {
	cancelled, cancel := context.WithCancel(t.Context())
	cancel()

	details, err := evaluator.NewEvaluator().Evaluate(cancelled, loopingFlag(), itemsContext(300))
	require.NoError(t, err)

	reported, ok := (*details.FlagMetadata)[evaluator.BrokenRulesMetadataKey].([]string)
	require.True(t, ok, "the interrupted rule must be reported in the flag metadata")
	require.Len(t, reported, 1)
	assert.Contains(t, reported[0], context.Canceled.Error())
	assert.NotContains(t, reported[0], featureflag.ErrRuleTooCostly.Error())
	assert.NotContains(t, reported[0], featureflag.ErrRuleTimedOut.Error())
}
