package evaluator_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/evaluator"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
)

/*
This file exercises the feature-flag engine end to end — a schema.FeatureFlag
manifest in, an openfeature.ResolutionDetails out — through each capability the
engine actually offers: hard/soft kill switches, percentage-based rollouts and
A/B tests, date-based scheduled releases, multi-rule targeting, and the two
distinct "nothing matched" cases. No database, no HTTP: CEL runs in memory and
the bucket math is pure, so a manifest plus the evaluator is the whole system
under test.

Percentage splits are verified statistically over many deterministic keys
("user-0".."user-N"), the same technique internal/infrastructure/featureflag's
own bucket_test.go and rollout_date_test.go use for the underlying primitives.
Tolerances are generous on purpose: the point is proving the capability and its
direction, not pinning an exact bucket-hash distribution.
*/

// TestCapability_KillSwitch_HardDisableIgnoresTargeting proves the hard kill
// switch: Enabled=false always serves the default variant, even when a
// targeting rule would otherwise match every request. This is the "flip it
// off in an incident" path — it must never evaluate a single targeting rule.
func TestCapability_KillSwitch_HardDisableIgnoresTargeting(t *testing.T) {
	e := evaluator.NewEvaluator()

	flag := schema.FeatureFlag{
		Name: "New Checkout Flow", Slug: "new-checkout", Type: "boolean",
		Enabled: false, // the kill switch: off, full stop
		Targetings: schema.Targetings{
			schema.NewBasicTargeting("Everyone", "true", "on"), // would match 100% of traffic if evaluated
		},
		DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("off")},
		Variants: []schema.Variant{
			{Name: "on", Value: true},
			{Name: "off", Value: false},
		},
	}
	ctx := openfeature.EvaluationContext{TargetingKey: "user-1"}

	details, err := e.Evaluate(t.Context(), flag, ctx)

	require.NoError(t, err)
	assert.Equal(t, false, details.Value)
	assert.Equal(t, "off", *details.Variant)
	assert.Equal(t, openfeature.ReasonDisabled, *details.Reason, "a disabled flag must report DISABLED, not whatever its rules would have said")
}

// TestCapability_KillSwitch_SoftToggleViaAlwaysTrueRule proves the other kill
// switch shape: Enabled stays true, and a single "matches everyone" rule
// (targetingKey/rule == "true") is what the operator actually flips by editing
// the default variant. Both positions must be reachable.
func TestCapability_KillSwitch_SoftToggleViaAlwaysTrueRule(t *testing.T) {
	e := evaluator.NewEvaluator()

	flag := func(defaultVariant string) schema.FeatureFlag {
		return schema.FeatureFlag{
			Name: "Maintenance Banner", Slug: "maintenance-banner", Type: "boolean", Enabled: true,
			Variants: []schema.Variant{{Name: "on", Value: true}, {Name: "off", Value: false}},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Everyone", "true", "on"),
			},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant(defaultVariant)},
		}
	}
	ctx := openfeature.EvaluationContext{TargetingKey: "user-1"}

	on, err := e.Evaluate(t.Context(), flag("off"), ctx)
	require.NoError(t, err)
	assert.Equal(t, "on", *on.Variant, "the always-true rule must fire regardless of what the default is")
	assert.Equal(t, openfeature.ReasonTargetingMatch, *on.Reason)
}

// TestCapability_ABTest_TwoVariantExperimentGatedByCohort demonstrates a real
// A/B test: only users in a named cohort enter the experiment (a CEL rule
// gates it), and within that cohort traffic is split ~50/50 between control
// and treatment via a percentage distribution. Users outside the cohort never
// enter the split at all.
func TestCapability_ABTest_TwoVariantExperimentGatedByCohort(t *testing.T) {
	e := evaluator.NewEvaluator()

	flag := schema.FeatureFlag{
		Name: "New Pricing Page", Slug: "new-pricing-page", Type: "string", Enabled: true,
		Variants: []schema.Variant{
			{Name: "control", Value: "old-pricing"},
			{Name: "treatment", Value: "new-pricing"},
		},
		Targetings: schema.Targetings{
			schema.NewRolloutPercentageTargeting(
				"Beta cohort experiment", "user.cohort == 'beta'",
				map[string]int64{"control": 50, "treatment": 50},
			),
		},
		DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("control")},
	}

	cohortCtx := func(key, cohort string) openfeature.EvaluationContext {
		return openfeature.EvaluationContext{
			TargetingKey: key,
			Inputs:       map[string]any{"user": map[string]any{"cohort": cohort}},
		}
	}

	// Outside the cohort: never enters the experiment, always control via the default.
	for _, key := range []string{"outsider-1", "outsider-2", "outsider-3"} {
		details, err := e.Evaluate(t.Context(), flag, cohortCtx(key, "general"))
		require.NoError(t, err)
		assert.Equal(t, "control", *details.Variant)
		assert.Equal(t, openfeature.ReasonDefault, *details.Reason)
	}

	// Inside the cohort: split roughly 50/50, deterministically per key.
	const sampleSize = 2000
	counts := map[string]int{}
	for i := range sampleSize {
		key := fmt.Sprintf("beta-user-%d", i)
		details, err := e.Evaluate(t.Context(), flag, cohortCtx(key, "beta"))
		require.NoError(t, err)
		assert.Equal(t, openfeature.ReasonSplit, *details.Reason)
		counts[*details.Variant]++
	}
	require.InDelta(t, sampleSize/2, counts["control"], float64(sampleSize)*0.1)
	require.InDelta(t, sampleSize/2, counts["treatment"], float64(sampleSize)*0.1)

	// Deterministic: the same beta user always lands on the same side.
	first, err := e.Evaluate(t.Context(), flag, cohortCtx("beta-user-0", "beta"))
	require.NoError(t, err)
	for range 5 {
		again, err := e.Evaluate(t.Context(), flag, cohortCtx("beta-user-0", "beta"))
		require.NoError(t, err)
		assert.Equal(t, *first.Variant, *again.Variant)
	}
}

// TestCapability_ABTest_MultiVariantWeightedExperiment covers an experiment
// with more than two arms and uneven weights, the shape a real growth
// experiment (e.g. three onboarding flows) actually takes.
func TestCapability_ABTest_MultiVariantWeightedExperiment(t *testing.T) {
	e := evaluator.NewEvaluator()

	flag := schema.FeatureFlag{
		Name: "Onboarding Flow Experiment", Slug: "onboarding-experiment", Type: "string", Enabled: true,
		Variants: []schema.Variant{
			{Name: "classic", Value: "classic-onboarding"},
			{Name: "guided", Value: "guided-onboarding"},
			{Name: "video", Value: "video-onboarding"},
		},
		DefaultVariant: &schema.DefaultVariant{
			Type: schema.RolloutPercentageType,
			Value: &schema.RolloutPercentageVariant{
				RolloutPercentage: schema.RolloutPercentage{
					Distribution: map[string]int64{"classic": 60, "guided": 30, "video": 10},
				},
			},
		},
	}

	const sampleSize = 5000
	counts := map[string]int{}
	for i := range sampleSize {
		ctx := openfeature.EvaluationContext{TargetingKey: fmt.Sprintf("user-%d", i)}
		details, err := e.Evaluate(t.Context(), flag, ctx)
		require.NoError(t, err)
		assert.Equal(t, openfeature.ReasonSplit, *details.Reason, "a percentage default with zero targetings still reports SPLIT, since it is the default that is doing the splitting")
		counts[*details.Variant]++
	}

	tolerance := float64(sampleSize) * 0.05
	require.InDelta(t, float64(sampleSize)*0.60, counts["classic"], tolerance)
	require.InDelta(t, float64(sampleSize)*0.30, counts["guided"], tolerance)
	require.InDelta(t, float64(sampleSize)*0.10, counts["video"], tolerance)
}

// TestCapability_RolloutBased_SimplePercentageRollout is the plainest rollout
// shape: no targeting rules at all, just "N% of everyone gets the new
// behavior" as the flag's entire configuration.
func TestCapability_RolloutBased_SimplePercentageRollout(t *testing.T) {
	e := evaluator.NewEvaluator()

	flag := schema.FeatureFlag{
		Name: "New Search Index", Slug: "new-search-index", Type: "boolean", Enabled: true,
		Variants: []schema.Variant{{Name: "new", Value: true}, {Name: "legacy", Value: false}},
		DefaultVariant: &schema.DefaultVariant{
			Type: schema.RolloutPercentageType,
			Value: &schema.RolloutPercentageVariant{
				RolloutPercentage: schema.RolloutPercentage{Distribution: map[string]int64{"new": 25, "legacy": 75}},
			},
		},
	}

	const sampleSize = 4000
	onNew := 0
	for i := range sampleSize {
		ctx := openfeature.EvaluationContext{TargetingKey: fmt.Sprintf("user-%d", i)}
		details, err := e.Evaluate(t.Context(), flag, ctx)
		require.NoError(t, err)
		if *details.Variant == "new" {
			onNew++
		}
	}
	require.InDelta(t, float64(sampleSize)*0.25, onNew, float64(sampleSize)*0.05)
}

// TestCapability_ScheduledRelease_GradualDateRolloutClimbsForward is the
// end-to-end regression test for a real bug found while building this suite:
// internal/infrastructure/featureflag.ResolveRolloutDate fed its interpolated
// percentage to the bucket primitive with the variant arguments swapped, so a
// schedule configured the natural way (0% -> 100%, old -> new) rolled out
// backwards — mostly on the new variant on day one, mostly on the old variant
// by the end. This proves the fix holds through the full evaluator, not just
// the infra primitive: the served share must climb toward the new variant as
// the release window progresses.
func TestCapability_ScheduledRelease_GradualDateRolloutClimbsForward(t *testing.T) {
	e := evaluator.NewEvaluator()

	const windowMinutes = 200
	const sampleSize = 2500

	percentOnNewVariant := func(elapsedFraction float64) float64 {
		start := time.Now().Add(-time.Duration(float64(windowMinutes)*elapsedFraction) * time.Minute)
		end := start.Add(windowMinutes * time.Minute)

		flag := schema.FeatureFlag{
			Name: "Redesigned Nav", Slug: "redesigned-nav", Type: "boolean", Enabled: true,
			Variants: []schema.Variant{{Name: "new-nav", Value: true}, {Name: "old-nav", Value: false}},
			DefaultVariant: &schema.DefaultVariant{
				Type: schema.RolloutDateType,
				Value: &schema.RolloutDateVariant{
					RolloutDate: schema.RolloutDate{
						Start: schema.RolloutStep{Variant: "old-nav", Percentage: 0, Date: start},
						End:   schema.RolloutStep{Variant: "new-nav", Percentage: 100, Date: end},
					},
				},
			},
		}

		onNew := 0
		for i := range sampleSize {
			ctx := openfeature.EvaluationContext{TargetingKey: fmt.Sprintf("user-%d", i)}
			details, err := e.Evaluate(t.Context(), flag, ctx)
			require.NoError(t, err)
			assert.Equal(t, openfeature.ReasonSplit, *details.Reason)
			if *details.Variant == "new-nav" {
				onNew++
			}
		}
		return float64(onNew) / float64(sampleSize) * 100
	}

	early := percentOnNewVariant(0.10)
	mid := percentOnNewVariant(0.50)
	late := percentOnNewVariant(0.90)

	require.InDelta(t, 10, early, 8)
	require.InDelta(t, 50, mid, 8)
	require.InDelta(t, 90, late, 8)
	require.Less(t, early, mid, "the new variant's share must climb as the release window progresses")
	require.Less(t, mid, late, "the new variant's share must climb as the release window progresses")
}

// TestCapability_ComplexTargeting_FirstMatchWinsAcrossOrderedRules covers a
// realistic multi-rule flag: several targeting rules that can each match
// independently, evaluated in declaration order, first match wins — even when
// a later rule would also have matched. Falls through to the default when
// nothing matches.
func TestCapability_ComplexTargeting_FirstMatchWinsAcrossOrderedRules(t *testing.T) {
	e := evaluator.NewEvaluator()

	flag := schema.FeatureFlag{
		Name: "Dashboard Layout", Slug: "dashboard-layout", Type: "string", Enabled: true,
		Variants: []schema.Variant{
			{Name: "admin-layout", Value: "admin"},
			{Name: "enterprise-layout", Value: "enterprise"},
			{Name: "standard-layout", Value: "standard"},
		},
		Targetings: schema.Targetings{
			// Declared first: must win even for a user who also matches the second rule.
			schema.NewBasicTargeting("Admins", "user.role == 'admin'", "admin-layout"),
			schema.NewBasicTargeting("Enterprise plan", "user.plan == 'enterprise'", "enterprise-layout"),
		},
		DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("standard-layout")},
	}

	userCtx := func(role, plan string) openfeature.EvaluationContext {
		return openfeature.EvaluationContext{
			TargetingKey: "user-1",
			Inputs:       map[string]any{"user": map[string]any{"role": role, "plan": plan}},
		}
	}

	t.Run("matches both rules — the first-declared rule wins", func(t *testing.T) {
		details, err := e.Evaluate(t.Context(), flag, userCtx("admin", "enterprise"))
		require.NoError(t, err)
		assert.Equal(t, "admin", details.Value)
		assert.Equal(t, openfeature.ReasonTargetingMatch, *details.Reason)
		require.NotNil(t, details.MatchedRuleName)
		assert.Equal(t, "Admins", *details.MatchedRuleName)
	})

	t.Run("matches only the second rule", func(t *testing.T) {
		details, err := e.Evaluate(t.Context(), flag, userCtx("member", "enterprise"))
		require.NoError(t, err)
		assert.Equal(t, "enterprise", details.Value)
		require.NotNil(t, details.MatchedRuleName)
		assert.Equal(t, "Enterprise plan", *details.MatchedRuleName)
	})

	t.Run("matches nothing — falls through to the default", func(t *testing.T) {
		details, err := e.Evaluate(t.Context(), flag, userCtx("member", "free"))
		require.NoError(t, err)
		assert.Equal(t, "standard", details.Value)
		assert.Equal(t, openfeature.ReasonDefault, *details.Reason)
	})
}

// TestCapability_DefaultRules_ZeroTargetingsVsNoRuleMatched proves the engine
// reports two different "used the default" situations with different reasons,
// even though the served value can be identical: a flag with no targeting
// rules at all reports whatever the default variant's own evaluation reason
// is (STATIC for a plain value), while a flag that HAS rules but none of them
// matched this request always reports an explicit DEFAULT. An operator
// reading the reason can tell "there was nothing to check" apart from "we
// checked, and nothing fired."
func TestCapability_DefaultRules_ZeroTargetingsVsNoRuleMatched(t *testing.T) {
	e := evaluator.NewEvaluator()
	ctx := openfeature.EvaluationContext{TargetingKey: "user-1", Inputs: map[string]any{}}

	t.Run("no targeting rules declared at all", func(t *testing.T) {
		flag := schema.FeatureFlag{
			Name: "Simple Toggle", Slug: "simple-toggle", Type: "boolean", Enabled: true,
			Variants:       []schema.Variant{{Name: "on", Value: true}, {Name: "off", Value: false}},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("on")},
		}
		details, err := e.Evaluate(t.Context(), flag, ctx)
		require.NoError(t, err)
		assert.Equal(t, "on", *details.Variant)
		assert.Equal(t, openfeature.ReasonStatic, *details.Reason, "with zero rules, the default's own STATIC reason surfaces directly")
	})

	t.Run("targeting rules declared, but none matched this request", func(t *testing.T) {
		flag := schema.FeatureFlag{
			Name: "Simple Toggle", Slug: "simple-toggle", Type: "boolean", Enabled: true,
			Variants: []schema.Variant{{Name: "on", Value: true}, {Name: "off", Value: false}},
			Targetings: schema.Targetings{
				schema.NewBasicTargeting("Only France", "user.country == 'FR'", "on"),
			},
			DefaultVariant: &schema.DefaultVariant{Type: schema.BasicType, Value: schema.BasicVariant("on")},
		}
		details, err := e.Evaluate(t.Context(), flag, ctx)
		require.NoError(t, err)
		assert.Equal(t, "on", *details.Variant, "same served value as the zero-rules case above")
		assert.Equal(t, openfeature.ReasonDefault, *details.Reason, "but with rules present that did not fire, the reason is an explicit DEFAULT")
	})
}
