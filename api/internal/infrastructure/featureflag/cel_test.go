package featureflag_test

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
)

func licenseContext(slug string) openfeature.EvaluationContext {
	return openfeature.EvaluationContext{
		TargetingKey: "user-1",
		Inputs: map[string]any{
			"__kaiten": map[string]any{"license": map[string]any{"slug": slug}},
		},
	}
}

/*
TestCachedRuleRunsAgainstTheCurrentContext is the correctness condition the
compilation cache has to meet.

Environments are cached per context shape and compiled programs per (shape,
rule), because neither depends on anything else — but the values a program runs
against come from the activation at evaluation time. Two contexts of the same
shape carrying different values must therefore reach different verdicts. A
cache that captured the first context's values instead would serve one tenant
another tenant's answer, which is a worse failure than the rebuilding it
replaces.
*/
func TestCachedRuleRunsAgainstTheCurrentContext(t *testing.T) {
	const rule = "__kaiten.license.slug == 'scale'"

	matches := func(slug string) bool {
		engine, err := featureflag.NewEngine(licenseContext(slug))
		require.NoError(t, err)

		matched, err := engine.EvaluateRule(t.Context(), rule)
		require.NoError(t, err)

		return matched
	}

	assert.True(t, matches("scale"))
	assert.False(t, matches("starter"))
	assert.True(t, matches("scale"))
}

// A rule that cannot compile must keep reporting the same failure, not compile
// by accident on a later call: its outcome is cached alongside the successes.
func TestABrokenRuleFailsTheSameWayEveryTime(t *testing.T) {
	engine, err := featureflag.NewEngine(licenseContext("scale"))
	require.NoError(t, err)

	first, err := engine.EvaluateRule(t.Context(), "__kaiten.license.slug ==")
	require.Error(t, err)
	assert.False(t, first)

	for range 3 {
		_, again := engine.EvaluateRule(t.Context(), "__kaiten.license.slug ==")
		require.Error(t, again)
		assert.Equal(t, err.Error(), again.Error())
	}
}

// A rule that returns something other than a boolean is a rule the engine
// cannot act on, and it must say so rather than treat it as "no".
func TestANonBooleanRuleIsRefused(t *testing.T) {
	engine, err := featureflag.NewEngine(licenseContext("scale"))
	require.NoError(t, err)

	_, err = engine.EvaluateRule(t.Context(), "__kaiten.license.slug")

	require.Error(t, err)
}

// literalList is a list of n zeros, written out: the shape that lets a rule's
// own text decide how many times it iterates.
func literalList(n int) string {
	return "[" + strings.TrimSuffix(strings.Repeat("0,", n), ",") + "]"
}

// nestedAll nests `.all()` depth deep over literal lists of n elements: n^depth
// iterations from about 2·n·depth characters of rule.
func nestedAll(n, depth int) string {
	rule := "true"
	for i := depth - 1; i >= 0; i-- {
		rule = fmt.Sprintf("%s.all(v%d, %s)", literalList(n), i, rule)
	}

	return rule
}

// listContext carries a host list of n zeros under `items`, for rules whose
// work comes from the context rather than from their own text.
func listContext(n int) openfeature.EvaluationContext {
	items := make([]any, n)
	for i := range items {
		items[i] = 0.0
	}

	return openfeature.EvaluationContext{TargetingKey: "user-1", Inputs: map[string]any{"items": items}}
}

/*
TestAPathologicalRuleIsStoppedQuickly is the attack the evaluation bounds exist
for: a rule as long as a rule may be, whose four nested loops would iterate 2.4
trillion times — hours of a core — if nothing stopped them.

It is the cost limit that stops it, long before the deadline could — in about
10ms on a laptop core, and well under a second even under the race detector on
a slow runner — and it fails as a rule that could not run, not as one that said
no.
*/
func TestAPathologicalRuleIsStoppedQuickly(t *testing.T) {
	rule := nestedAll(1240, 4)
	require.LessOrEqual(t, len(rule), 10_000, "the attack must fit in the length a rule may have")

	engine, err := featureflag.NewEngine(licenseContext("scale"))
	require.NoError(t, err)

	// The first evaluation also compiles the rule, which is then cached, as a
	// saved rule is after its first use. What every later evaluation pays is
	// the run, so the run is what is timed.
	_, _ = engine.EvaluateRule(t.Context(), rule)

	start := time.Now()
	matched, err := engine.EvaluateRule(t.Context(), rule)
	elapsed := time.Since(start)

	assert.False(t, matched)
	var evalErr *featureflag.EvalError
	require.ErrorAs(t, err, &evalErr)
	assert.ErrorIs(t, err, featureflag.ErrRuleTooCostly)
	assert.Less(t, elapsed, time.Second)
}

// The cost limit is counted, not timed, so a rule over it fails the same way on
// every machine and every call. This one reaches it on its first `contains`, in
// microseconds — the call is charged for the two strings it walks — long before
// any deadline could be the reason. The needle depends on the loop, so the call
// cannot be computed once at compile time.
func TestTheCostLimitIsCountedNotTimed(t *testing.T) {
	rule := fmt.Sprintf("[1, 2, 3, 4, 5].exists(i, '%s'.contains('%sb' + string(i)))",
		strings.Repeat("a", 3000), strings.Repeat("a", 1500))

	engine, err := featureflag.NewEngine(licenseContext("scale"))
	require.NoError(t, err)

	for range 3 {
		matched, err := engine.EvaluateRule(t.Context(), rule)
		require.ErrorIs(t, err, featureflag.ErrRuleTooCostly)
		assert.False(t, matched)
	}
}

/*
TestTheCallersContextInterruptsTheRule: the evaluation runs under the request's
context, so a caller that stops waiting stops the rule too, at its next check,
instead of leaving it to run to a bound nobody is waiting on.

The rules are chosen so that neither bound would have stopped them this early.
The error must say it was the caller: a hang-up is not a rule's fault, and must
not read as one.
*/
func TestTheCallersContextInterruptsTheRule(t *testing.T) {
	t.Run("a context cancelled before the rule runs", func(t *testing.T) {
		engine, err := featureflag.NewEngine(listContext(1000))
		require.NoError(t, err)

		cancelled, cancel := context.WithCancel(t.Context())
		cancel()

		_, err = engine.EvaluateRule(cancelled, "items.all(a, items.all(b, true))")

		require.ErrorIs(t, err, context.Canceled)
		assert.NotErrorIs(t, err, featureflag.ErrRuleTooCostly)
		assert.NotErrorIs(t, err, featureflag.ErrRuleTimedOut)
	})

	t.Run("a deadline that passes while the rule runs", func(t *testing.T) {
		// Tens of milliseconds from its cost limit on a laptop core, so a
		// deadline of two is what stops it.
		engine, err := featureflag.NewEngine(listContext(50_000))
		require.NoError(t, err)

		deadline, cancel := context.WithTimeout(t.Context(), 2*time.Millisecond)
		defer cancel()

		matched, err := engine.EvaluateRule(deadline, "items.all(a, true)")

		require.ErrorIs(t, err, context.DeadlineExceeded)
		assert.NotErrorIs(t, err, featureflag.ErrRuleTimedOut)
		assert.NotErrorIs(t, err, featureflag.ErrRuleTooCostly)
		assert.False(t, matched)
	})
}

/*
TestLegitimateRulesRunUnderTheBounds is the other side of the bounds: what they
must never stop.

The longest rules the repository holds, both from the console's stories; the
widest allowlist the length cap allows; and a loop over a host list of a
thousand elements with an `in` in its predicate, well past anything the
repository's rules do — none of them iterates. Each lints clean, so the cost
estimate does not refuse it either, and each runs to its answer.
*/
func TestLegitimateRulesRunUnderTheBounds(t *testing.T) {
	groups := make([]any, 1000)
	for i := range groups {
		groups[i] = fmt.Sprintf("group-%d", i)
	}
	ids := make([]string, 700)
	for i := range ids {
		ids[i] = fmt.Sprintf("'cust-%05d'", i)
	}
	allowlist := "targetingKey in [" + strings.Join(ids, ", ") + "]"
	require.LessOrEqual(t, len(allowlist), 10_000)

	engine, err := featureflag.NewEngine(openfeature.EvaluationContext{
		TargetingKey: "cust-00699",
		Inputs: map[string]any{
			"user": map[string]any{"cohort": "beta", "groups": groups},
			"__kaiten": map[string]any{
				"deploymentZone": map[string]any{"type": "staging"},
				"license":        map[string]any{"slug": "scale"},
				"entitlements":   map[string]any{"seats": map[string]any{"remaining": 3.0}},
				"instance":       map[string]any{"status": "HEALTHY", "lifecycleStage": "ACTIVE"},
			},
		},
	})
	require.NoError(t, err)

	for _, rule := range []string{
		"(__kaiten.deploymentZone.type == 'production' || __kaiten.deploymentZone.type == 'staging') &&\n" +
			"__kaiten.license.slug in ['scale', 'premium'] &&\n" +
			"__kaiten.entitlements['seats'].remaining > 0 &&\n" +
			"!(user.cohort == 'beta-excluded')",
		"__kaiten.license.slug == 'scale' &&\n" +
			"__kaiten.entitlements['seats'].remaining < 5 &&\n" +
			"__kaiten.instance.status == 'HEALTHY' &&\n" +
			"has(__kaiten.instance.lifecycleStage) &&\n" +
			"user.cohort == 'beta'",
		allowlist,
		"user.groups.exists(g, g in ['admins', 'group-999', 'ops'])",
	} {
		assert.NoError(t, featureflag.LintTargetingRule(rule, nil), "lint: %.80s", rule)

		matched, err := engine.EvaluateRule(t.Context(), rule)
		assert.NoError(t, err, "evaluate: %.80s", rule)
		assert.True(t, matched, "rule should have matched: %.80s", rule)
	}
}
