package featureflag_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
)

var catalogue = []string{"customers", "instances", "seats"}

func TestLintAcceptsWhatWorks(t *testing.T) {
	for _, rule := range []string{
		"true",
		"__kaiten.license.slug == 'scale'",
		"__kaiten.license.familySlug == 'scale'",
		"__kaiten.license.type == 'PAID'",
		"__kaiten.entitlements['customers'].percentage >= 0.9",
		"__kaiten.license.slug == 'scale' || __kaiten.entitlements['seats'].remaining < 5",
		// A host's own attributes: the world cannot be closed, and these are
		// legitimate rules the server knows nothing about.
		"user.cohort == 'beta'",
		"device.os == 'ios' && __kaiten.license.slug != 'starter'",
		// A computed index cannot be checked, and refusing it would forbid a
		// rule that may well be correct.
		"__kaiten.entitlements[someKey].used > 1",
		// Dot access is the same lookup as the indexed form, and it is
		// checked the same way.
		"__kaiten.entitlements.seats.remaining < 5",
		// Numbers are compared against integer literals, the way a rule
		// author writes them — requiring `10.0` was an opaque type error on
		// a rule that reads correctly.
		"__kaiten.entitlements['seats'].used > 10",
		"user.seatCount > 10",
		"__kaiten.instance.status == 'HEALTHY'",
		// metadata is a dynamic map — only the top-level field name
		// (metadata itself) is checked, never what's inside it.
		"__kaiten.instance.metadata.demo == true",
		"__kaiten.customer.domain == 'acme.com'",
		"__kaiten.deploymentZone.type == 'production'",
		"__kaiten.deploymentZone.currentReleaseId == 'rel-1'",
		// kaiten.* (no underscore) is the caller-input namespace, never a
		// legitimate thing to target on — but not our job to police it
		// either: it's just an unknown root, same as any host attribute.
		"kaiten.instanceSlug == 'x'",
	} {
		assert.NoError(t, featureflag.LintTargetingRule(rule, catalogue), "rule: %s", rule)
	}
}

func TestLintRefusesWhatCannotWork(t *testing.T) {
	cases := map[string]string{
		"empty":                                 "",
		"blank":                                 "   ",
		"syntax":                                "__kaiten.license.slug == ",
		"unknown licence key":                   "__kaiten.license.tier == 'scale'",
		"typo in a field":                       "__kaiten.entitlements['seats'].percentag >= 0.9",
		"entitlement absent from the catalogue": "__kaiten.entitlements['sieges'].percentage >= 0.9",
		"typo in an instance field":             "__kaiten.instance.stauts == 'HEALTHY'",
		"typo in a customer field":              "__kaiten.customer.emial == 'x@example.com'",
		"typo in a deployment zone field":       "__kaiten.deploymentZone.tpye == 'production'",
		// Dot access used to reach an entitlement with nothing checking
		// either the slug or the field below it.
		"entitlement dot access, absent from the catalogue": "__kaiten.entitlements.sieges.percentage >= 0.9",
		"entitlement dot access, typo in a field":           "__kaiten.entitlements.seats.usage > 1",
	}

	for name, rule := range cases {
		t.Run(name, func(t *testing.T) {
			assert.Error(t, featureflag.LintTargetingRule(rule, catalogue))
		})
	}
}

// The message has to name the mistake and the way out — the reason this check
// exists is that the alternative is a feature that is silently never enabled.
func TestLintSaysWhatIsWrong(t *testing.T) {
	err := featureflag.LintTargetingRule("__kaiten.entitlements['sieges'].percentage >= 0.9", catalogue)
	assert.ErrorContains(t, err, "sieges")
	assert.ErrorContains(t, err, "does not have")

	err = featureflag.LintTargetingRule("__kaiten.license.tier == 'x'", catalogue)
	assert.ErrorContains(t, err, "slug, familySlug, type")
}

// Without a catalogue the slug cannot be judged, but everything else still is.
func TestLintWithoutACatalogue(t *testing.T) {
	assert.NoError(t, featureflag.LintTargetingRule("__kaiten.entitlements['anything'].used > 0", nil))
	assert.Error(t, featureflag.LintTargetingRule("__kaiten.entitlements['anything'].nope > 0", nil))
	assert.NoError(t, featureflag.LintTargetingRule("__kaiten.entitlements.anything.used > 0", nil))
	assert.Error(t, featureflag.LintTargetingRule("__kaiten.entitlements.anything.nope > 0", nil))
}

// CEL rejects "" as a syntax error at evaluation, so a blank rule accepted on
// write is broken on every read. Both entry points must agree, or a rule refused
// by one arrives through the other.
func TestBlankRuleIsRefusedByBothEntryPoints(t *testing.T) {
	assert.ErrorIs(t, featureflag.LintTargetingRule("", catalogue), featureflag.ErrEmptyRule)
	assert.ErrorIs(t, featureflag.ValidateRule(""), featureflag.ErrEmptyRule)
	assert.ErrorIs(t, featureflag.ValidateRule("  \t "), featureflag.ErrEmptyRule)

	assert.NoError(t, featureflag.ValidateRule("true"))
}

/*
TestLintAgreesWithEvaluation is the check the two type models used to fail: the
linter typed a host attribute dyn and the runtime typed it from whatever value
the context happened to carry, so a rule could lint clean and then fail its
type check at evaluation with an opaque CEL message.

Every rule here is linted and then actually run, against a context whose values
have the shapes the enrichment really produces.
*/
func TestLintAgreesWithEvaluation(t *testing.T) {
	ctx := openfeature.EvaluationContext{
		TargetingKey: "user-1",
		Inputs: map[string]any{
			"seatCount": 42.0,
			"user":      map[string]any{"cohort": "beta"},
			"__kaiten": map[string]any{
				"license":      map[string]any{"slug": "scale-v2", "familySlug": "scale", "type": "PAID"},
				"entitlements": map[string]any{"seats": map[string]any{"used": 12.0, "remaining": 3.0}},
			},
		},
	}

	engine, err := featureflag.NewEngine(ctx)
	require.NoError(t, err)

	for _, rule := range []string{
		"seatCount > 10",
		"seatCount > 10.0",
		"user.cohort == 'beta'",
		"__kaiten.license.slug == 'scale-v2'",
		"__kaiten.license.familySlug == 'scale'",
		"__kaiten.entitlements['seats'].used > 10",
		"__kaiten.entitlements.seats.remaining < 5",
	} {
		assert.NoError(t, featureflag.LintTargetingRule(rule, catalogue), "lint: %s", rule)

		matched, err := engine.EvaluateRule(t.Context(), rule)
		assert.NoError(t, err, "evaluate: %s", rule)
		assert.True(t, matched, "rule should have matched: %s", rule)
	}
}

/*
TestIssuesUnderlineTheMistakeItself is what the positions are for.

The console draws a squiggle from these, and a squiggle in roughly the right
place is worse than none: it sends the author looking at the wrong name. The
parser records a select's position on its dot and gives the name it selects no
node of its own, so every one of these spans is computed rather than read back
— which is exactly the kind of arithmetic that is wrong until it is pinned.
*/
func TestIssuesUnderlineTheMistakeItself(t *testing.T) {
	for rule, expected := range map[string]string{
		"__kaiten.license.slgu == 'scale'":                 ".slgu",
		"true &&\n  __kaiten.instance.stauts == 'HEALTHY'": ".stauts",
		"__kaiten.customer.emial == 'x@example.com'":       ".emial",
		"__kaiten.entitlements['seats'].percentag >= 0.9":  ".percentag",
		"__kaiten.entitlements.seats.usage > 1":            ".usage",
		// The slug is the mistake here, not the field read off it, so that is
		// what gets underlined — in whichever form it is written.
		"__kaiten.entitlements['sieges'].percentage >= 0.9": "'sieges'",
		"__kaiten.entitlements.sieges.percentage >= 0.9":    ".sieges",
		// CEL allows whitespace around the dot, and the span is measured from
		// the dot rather than read back — so the measurement has to walk over
		// what an author may put there.
		"__kaiten.license .  slgu == 'scale'": ".  slgu",
		// CEL counts offsets in runes, not bytes. A non-ASCII literal before
		// the mistake is exactly where a byte-based measurement would drift.
		"__kaiten.customer.domain == 'café-corp.fr' && __kaiten.license.slgu == 'x'": ".slgu",
		// An unknown sub-root is underlined at the sub-root, not at whatever
		// field happens to be read off it.
		"__kaiten.customers.id == 'x'": ".customers",
	} {
		t.Run(expected, func(t *testing.T) {
			issues := featureflag.LintTargetingRuleIssues(rule, catalogue)
			require.Len(t, issues, 1)

			assert.Equal(t, expected, underlined(t, rule, issues[0]))
		})
	}
}

// underlined is the text an editor would draw the squiggle under, given a
// 1-based line/column range. Columns count runes, the unit CEL reports in, so
// the line is sliced as runes — byte slicing would shear a line that carries
// any non-ASCII text before the issue.
func underlined(t *testing.T, rule string, issue featureflag.TargetingRuleIssue) string {
	t.Helper()

	require.Positive(t, issue.Line, "issue has no position")
	require.Positive(t, issue.EndColumn, "issue has no extent")

	lines := strings.Split(rule, "\n")
	require.LessOrEqual(t, issue.Line, len(lines))
	require.Equal(t, issue.Line, issue.EndLine, "no case here spans lines")

	line := []rune(lines[issue.Line-1])
	require.LessOrEqual(t, issue.EndColumn-1, len(line))

	return string(line[issue.Column-1 : issue.EndColumn-1])
}

// CEL reports its own syntax and type errors with a point and no extent, and
// says so by leaving the end unset rather than by inventing one.
func TestCelsOwnIssuesArePositionedButHaveNoExtent(t *testing.T) {
	issues := featureflag.LintTargetingRuleIssues("__kaiten.license.slug == ", catalogue)

	require.NotEmpty(t, issues)
	assert.Equal(t, 1, issues[0].Line)
	assert.Positive(t, issues[0].Column)
	assert.Zero(t, issues[0].EndColumn)
	assert.NotEmpty(t, issues[0].Message)
}

// A rule can be wrong without being wrong anywhere in particular.
func TestBlankRuleHasNoPosition(t *testing.T) {
	issues := featureflag.LintTargetingRuleIssues("   ", catalogue)

	require.Len(t, issues, 1)
	assert.Zero(t, issues[0].Line)
	assert.Contains(t, issues[0].Message, "empty")
}

/*
TestBothEntryPointsAgree is the property that makes the editor worth trusting.

The console lints while the author types and the API lints again on save. If
those two could disagree, the editor would be another hand-written
approximation of the rules — the thing this replaced. They are one pass, and
this is what says so.
*/
func TestBothEntryPointsAgree(t *testing.T) {
	rules := []string{
		"true",
		"",
		"   ",
		"__kaiten.license.slug == 'scale'",
		"__kaiten.license.tier == 'scale'",
		"__kaiten.entitlements['sieges'].percentage >= 0.9",
		"__kaiten.entitlements['seats'].percentag >= 0.9",
		"__kaiten.entitlements.seats.remaining < 5",
		"__kaiten.instance.metadata.demo == true",
		"user.cohort == 'beta'",
		"__kaiten.license.slug == ",
		"__kaiten.deploymentZone.tpye == 'production'",
	}

	for _, rule := range rules {
		refused := featureflag.LintTargetingRule(rule, catalogue) != nil
		issues := featureflag.LintTargetingRuleIssues(rule, catalogue)

		assert.Equal(t, refused, len(issues) > 0,
			"the two entry points disagree about %q", rule)
	}
}

// Whatever the write path refuses with is what the author is shown, rather
// than a second wording of the same objection maintained beside it.
func TestIssuesCarryTheSameWordsAsTheRefusal(t *testing.T) {
	const rule = "__kaiten.entitlements['sieges'].percentage >= 0.9"

	err := featureflag.LintTargetingRule(rule, catalogue)
	issues := featureflag.LintTargetingRuleIssues(rule, catalogue)

	require.Error(t, err)
	require.Len(t, issues, 1)
	assert.Contains(t, err.Error(), issues[0].Message)
}

func TestNothingIsReportedForARuleThatWorks(t *testing.T) {
	for _, rule := range []string{
		"true",
		"__kaiten.license.slug == 'scale'",
		"__kaiten.entitlements['seats'].remaining < 5",
		"user.cohort == 'beta' && device.os == 'ios'",
	} {
		assert.Empty(t, featureflag.LintTargetingRuleIssues(rule, catalogue), "rule: %s", rule)
	}
}

// A clean rule answers with an empty list rather than nil, so the transport
// serialises `[]` and no client grows a null branch for the common case.
func TestCleanRuleAnswersWithAnEmptyListNotNil(t *testing.T) {
	issues := featureflag.LintTargetingRuleIssues("true", catalogue)

	assert.NotNil(t, issues)
	assert.Empty(t, issues)
}

/*
TestUnknownFactsSubrootIsRefused pins the gap the console's own dialog exposed:
an author typed `__kaiten.customers` (for `customer`) and the lint said
nothing, because it only judged fields under sub-roots it knew and waved the
rest through as if they were host attributes. They are not — everything under
FactsRoot is server-written, so the world is closed there and a name outside
it is a rule that can never match.
*/
func TestUnknownFactsSubrootIsRefused(t *testing.T) {
	for name, rule := range map[string]string{
		"plural of a real subroot": "__kaiten.customers.id == 'x'",
		"typo in a subroot":        "__kaiten.custmer.domain == 'a.com'",
		"bare unknown subroot":     "has(__kaiten.licence)",
		"comparison on it":         "__kaiten.licenses == 'scale'",
	} {
		t.Run(name, func(t *testing.T) {
			err := featureflag.LintTargetingRule(rule, catalogue)

			require.Error(t, err)
			assert.ErrorContains(t, err, "available: license, entitlements, instance, customer, deploymentZone")
		})
	}

	// The five that exist stay readable, bare included — has() on a sub-root
	// is a legitimate guard.
	for _, rule := range []string{
		"has(__kaiten.license)",
		"has(__kaiten.entitlements)",
		"has(__kaiten.instance)",
		"has(__kaiten.customer)",
		"has(__kaiten.deploymentZone)",
	} {
		assert.NoError(t, featureflag.LintTargetingRule(rule, catalogue), "rule: %s", rule)
	}
}

/*
TestARuleTooCostlyToEvaluateIsRefused: a rule whose own text commits it to more
work than evaluation allows is refused when it is written, instead of saving
cleanly and then failing on every evaluation where it does not match.

What is judged is the text, not the inputs. A rule looping over a host's list
can only be judged against a context, so it is let through here and bounded at
evaluation.
*/
func TestARuleTooCostlyToEvaluateIsRefused(t *testing.T) {
	costly := nestedAll(100, 3)

	t.Run("nested loops over literal lists", func(t *testing.T) {
		err := featureflag.LintTargetingRule(costly, catalogue)

		require.ErrorIs(t, err, featureflag.ErrRuleTooCostly)
		assert.ErrorContains(t, err, "could cost up to")
	})

	// CEL's best case assumes every && and || short-circuits, which would put
	// all of these at almost nothing: the estimate is the worst case so that
	// hiding the loops behind a branch does not hide them from it.
	t.Run("behind a branch that could skip them", func(t *testing.T) {
		for _, rule := range []string{
			"true || " + costly,
			"targetingKey == 'x' && " + costly,
			"targetingKey == 'x' ? true : " + costly,
		} {
			assert.ErrorIs(t, featureflag.LintTargetingRule(rule, catalogue), featureflag.ErrRuleTooCostly, "rule: %.60s", rule)
		}
	})

	// The editor shows it too, about the rule as a whole: no one name in it is
	// the mistake.
	t.Run("as an editor issue", func(t *testing.T) {
		issues := featureflag.LintTargetingRuleIssues(costly, catalogue)

		require.Len(t, issues, 1)
		assert.Zero(t, issues[0].Line)
		assert.Contains(t, issues[0].Message, "could cost up to")
	})

	t.Run("not a loop over the context", func(t *testing.T) {
		assert.NoError(t, featureflag.LintTargetingRule("items.all(a, items.all(b, items.all(c, true)))", catalogue))
	})
}
