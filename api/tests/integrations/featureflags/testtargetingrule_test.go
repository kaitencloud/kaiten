package featureflags_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/testtargetingrule"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func rehearse(t *testing.T, trial testtargetingrule.TargetingRuleTrial) testtargetingrule.TargetingRuleRehearsal {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, "POST", "/api/feature-flags/targeting/test", trial)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return commonfixture.AssertJSONResponse[testtargetingrule.TargetingRuleRehearsal](t, resp, fiber.StatusOK)
}

func TestTestTargetingRule(t *testing.T) {
	t.Run("WhenTheContextCarriesTheAttribute_TheRuleMatches", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		matched := rehearse(t, testtargetingrule.TargetingRuleTrial{
			Rule:    "user.cohort == 'beta'",
			Context: map[string]any{"user": map[string]any{"cohort": "beta"}},
		})
		missed := rehearse(t, testtargetingrule.TargetingRuleTrial{
			Rule:    "user.cohort == 'beta'",
			Context: map[string]any{"user": map[string]any{"cohort": "control"}},
		})

		// Assert
		assert.True(t, matched.Valid)
		assert.True(t, matched.Matched)
		assert.False(t, missed.Matched)
	})

	t.Run("WhenTheRuleDoesNotLint_ItIsNotRun", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		actual := rehearse(t, testtargetingrule.TargetingRuleTrial{
			Rule: "__kaiten.license.slgu == 'scale'",
		})

		// Assert
		assert.False(t, actual.Valid)
		require.NotEmpty(t, actual.Issues)
		assert.Contains(t, actual.Issues[0].Message, "slug, familySlug, type")
		assert.False(t, actual.Matched)
	})

	// The rehearsal must lie exactly as little as production does: a caller
	// putting __kaiten in its own context is judged on facts the server
	// computed, not on its claim — here as there.
	t.Run("WhenTheContextForgesKaitenFacts_TheyAreDiscarded", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		actual := rehearse(t, testtargetingrule.TargetingRuleTrial{
			Rule: "__kaiten.license.slug == 'scale'",
			Context: map[string]any{
				"__kaiten": map[string]any{"license": map[string]any{"slug": "scale"}},
			},
		})

		// Assert
		assert.True(t, actual.Valid)
		assert.False(t, actual.Matched, "a forged fact matched — the rehearsal is not running the real reset")
		assert.NotContains(t, actual.Facts, "license")
	})

	// An erroring rule is an answer, not a failure: at a real evaluation it
	// simply never matches, and the author deserves to know why.
	t.Run("WhenTheRuleReadsWhatTheContextLacks_TheErrorIsExplained", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		actual := rehearse(t, testtargetingrule.TargetingRuleTrial{
			Rule: "user.cohort == 'beta'",
		})

		// Assert
		assert.True(t, actual.Valid)
		assert.False(t, actual.Matched)
		assert.NotEmpty(t, actual.EvaluationError)
	})

	// A product and one of its versions are two questions. For a customer moved
	// to a later version, a rule on the family still matches, and a rule on the
	// first version's slug no longer does: that silent miss is what familySlug
	// is for.
	t.Run("WhenTheCustomerIsOnALaterVersion_ItsProductStillMatches", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		customer := newTargetingCustomer(t, "Product Customer")
		first := newTargetingLicense(t, "Product License")
		second := newTargetingLicenseVersion(t, first)
		newTargetingInstance(t, "Product Instance", customer, second)

		// Act
		product := rehearse(t, testtargetingrule.TargetingRuleTrial{
			Rule:         "__kaiten.license.familySlug == '" + first.Slug + "'",
			TargetingKey: customer.Slug,
		})
		firstVersion := rehearse(t, testtargetingrule.TargetingRuleTrial{
			Rule:         "__kaiten.license.slug == '" + first.Slug + "'",
			TargetingKey: customer.Slug,
		})

		// Assert
		assert.True(t, product.Valid)
		assert.True(t, product.Matched)
		assert.True(t, firstVersion.Valid)
		assert.False(t, firstVersion.Matched)

		license, ok := product.Facts["license"].(map[string]any)
		require.True(t, ok, "license facts missing from the rehearsal: %v", product.Facts)
		assert.Equal(t, second.Slug, license["slug"])
		assert.Equal(t, first.Slug, license["familySlug"])
	})

	// The whole point of rehearsing server-side: the facts come from the same
	// enrichment the evaluations run, so the author sees what a rule reads.
	t.Run("WhenTheContextNamesAnInstance_ItsFactsAreEnrichedAndReadable", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		customer := newTargetingCustomer(t, "Rehearsal Customer")
		license := newTargetingLicense(t, "Rehearsal License")
		instance := newTargetingInstance(t, "Rehearsal Instance", customer, license)

		// Act
		actual := rehearse(t, testtargetingrule.TargetingRuleTrial{
			Rule: "__kaiten.instance.slug == '" + instance.Slug + "' && __kaiten.customer.name == 'Rehearsal Customer'",
			Context: map[string]any{
				"kaiten": map[string]any{"instanceSlug": instance.Slug},
			},
		})

		// Assert
		assert.True(t, actual.Valid)
		assert.True(t, actual.Matched)

		facts, ok := actual.Facts["instance"].(map[string]any)
		require.True(t, ok, "instance facts missing from the rehearsal: %v", actual.Facts)
		assert.Equal(t, instance.Slug, facts["slug"])
	})

	// The endpoint runs whatever rule it is sent, so it is where a rule built
	// to hold a core would be tried first. One whose own loops are too costly
	// never runs: the lint refuses it, as the save would.
	t.Run("WhenTheRuleIsTooCostlyToEvaluate_ItIsRefusedWithoutRunning", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		start := time.Now()
		actual := rehearse(t, testtargetingrule.TargetingRuleTrial{Rule: literalLoops(1240, 4)})
		elapsed := time.Since(start)

		// Assert
		assert.False(t, actual.Valid)
		require.Len(t, actual.Issues, 1)
		assert.Contains(t, actual.Issues[0].Message, "could cost up to")
		assert.False(t, actual.Matched)
		assert.Less(t, elapsed, 2*time.Second)
	})

	// One whose loops are over the trial context lints clean — the lint cannot
	// know how long the caller will make the list — so it runs, and is stopped.
	t.Run("WhenTheContextMakesTheRuleTooCostly_ItIsStoppedAndExplained", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		start := time.Now()
		actual := rehearse(t, testtargetingrule.TargetingRuleTrial{
			Rule:    "items.all(a, items.all(b, items.all(c, true)))",
			Context: map[string]any{"items": zeros(1000)},
		})
		elapsed := time.Since(start)

		// Assert
		assert.True(t, actual.Valid)
		assert.False(t, actual.Matched)
		assertStoppedByTheCostLimit(t, actual.EvaluationError)
		assert.Less(t, elapsed, 2*time.Second)
	})
}

// literalLoops nests `.all()` depth deep over literal lists of n zeros: n^depth
// iterations written into the rule itself.
func literalLoops(n, depth int) string {
	list := "[" + strings.TrimSuffix(strings.Repeat("0,", n), ",") + "]"
	rule := "true"
	for i := range depth {
		rule = fmt.Sprintf("%s.all(v%d, %s)", list, i, rule)
	}

	return rule
}

// zeros is a host list of n elements, for a rule whose loops walk the context.
func zeros(n int) []any {
	items := make([]any, n)
	for i := range items {
		items[i] = 0
	}

	return items
}

// assertStoppedByTheCostLimit checks that message says the rule was stopped
// for the work it did — by the count, not by the clock, so on any runner.
func assertStoppedByTheCostLimit(t *testing.T, message string) {
	t.Helper()

	assert.Contains(t, message, featureflag.ErrRuleTooCostly.Error())
}
