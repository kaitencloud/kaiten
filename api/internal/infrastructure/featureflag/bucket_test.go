package featureflag_test

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/featureflag"
)

func TestAssignByGradualRollout_Deterministic(t *testing.T) {
	got := featureflag.AssignByGradualRollout("flag-1", "user-1", 50, "start", "end")
	for range 10 {
		require.Equal(t, got, featureflag.AssignByGradualRollout("flag-1", "user-1", 50, "start", "end"))
	}
}

func TestAssignByGradualRollout_ZeroPercentAlwaysEnd(t *testing.T) {
	for _, key := range []string{"a", "b", "c", "d", "e"} {
		require.Equal(t, "end", featureflag.AssignByGradualRollout("flag-1", key, 0, "start", "end"))
	}
}

func TestAssignByGradualRollout_HundredPercentAlwaysStart(t *testing.T) {
	for _, key := range []string{"a", "b", "c", "d", "e"} {
		require.Equal(t, "start", featureflag.AssignByGradualRollout("flag-1", key, 100, "start", "end"))
	}
}

func TestAssignByWeightedDistribution_EmptyReturnsEmpty(t *testing.T) {
	require.Equal(t, "", featureflag.AssignByWeightedDistribution("flag-1", "user-1", map[string]int64{}))
}

func TestAssignByWeightedDistribution_AllZeroWeightsReturnsEmpty(t *testing.T) {
	require.Equal(t, "", featureflag.AssignByWeightedDistribution("flag-1", "user-1", map[string]int64{"a": 0, "b": 0}))
}

func TestAssignByWeightedDistribution_SingleVariantAlwaysWins(t *testing.T) {
	for _, key := range []string{"a", "b", "c", "d", "e"} {
		require.Equal(t, "only", featureflag.AssignByWeightedDistribution("flag-1", key, map[string]int64{"only": 1}))
	}
}

func TestAssignByWeightedDistribution_Deterministic(t *testing.T) {
	distribution := map[string]int64{"a": 30, "b": 70}
	got := featureflag.AssignByWeightedDistribution("flag-1", "user-1", distribution)
	for range 10 {
		require.Equal(t, got, featureflag.AssignByWeightedDistribution("flag-1", "user-1", distribution))
	}
}

func TestAssignByWeightedDistribution_ApproximatesDistribution(t *testing.T) {
	distribution := map[string]int64{"a": 50, "b": 50}
	counts := map[string]int{}

	for i := range 2000 {
		key := "user-" + string(rune('a'+i%26)) + string(rune('0'+i%10))
		counts[featureflag.AssignByWeightedDistribution("flag-1", key, distribution)]++
	}

	require.InDelta(t, 1000, counts["a"], 200)
	require.InDelta(t, 1000, counts["b"], 200)
}

/*
TestAssignByWeightedDistribution_FlagsSplitIndependently is the property the
marginal-distribution tests above cannot see: an unsalted hash satisfies every
one of them and still gives EVERY flag the identical split of the population.

Two flags rolling out to 10% must not roll out to the same 10%. Independent
rollouts overlap on the product of their shares — about 1% of subjects for two
10% rollouts — not on the whole cohort, which is what a targeting-key-only hash
produces.
*/
func TestAssignByWeightedDistribution_FlagsSplitIndependently(t *testing.T) {
	const sampleSize = 5000
	distribution := map[string]int64{"beta": 10, "classic": 90}

	var disagreements, inFirstCohort, inBothCohorts int
	for i := range sampleSize {
		key := fmt.Sprintf("user-%d", i)

		first := featureflag.AssignByWeightedDistribution("beta-onboarding-flow", key, distribution)
		second := featureflag.AssignByWeightedDistribution("new-search-index", key, distribution)

		if first != second {
			disagreements++
		}
		if first == "beta" {
			inFirstCohort++
		}
		if first == "beta" && second == "beta" {
			inBothCohorts++
		}
	}

	require.NotZero(t, disagreements,
		"two flags at the same percentage must not select the same subjects")
	require.InDelta(t, float64(sampleSize)*0.01, inBothCohorts, float64(sampleSize)*0.01,
		"two independent 10%% rollouts overlap on ~1%% of subjects")
	require.Less(t, inBothCohorts, inFirstCohort/2,
		"the second flag's cohort must not be a copy of the first's")
}

// TestAssignByGradualRollout_FlagsSplitIndependently is the same property for
// the gradual-rollout primitive: at 50%, two flags must disagree on roughly
// half the population, not on none of it.
func TestAssignByGradualRollout_FlagsSplitIndependently(t *testing.T) {
	const sampleSize = 5000

	disagreements := 0
	for i := range sampleSize {
		key := fmt.Sprintf("user-%d", i)

		first := featureflag.AssignByGradualRollout("redesigned-nav", key, 50, "new", "old")
		second := featureflag.AssignByGradualRollout("ai-insights", key, 50, "new", "old")

		if first != second {
			disagreements++
		}
	}

	require.InDelta(t, float64(sampleSize)*0.5, disagreements, float64(sampleSize)*0.1)
}

// A given (flag, subject) pair must land in the same bucket forever: the salt
// is the flag key precisely because it is stable, and an assignment that moved
// between two requests would be worse than the correlation it fixes.
func TestBucketing_StableAcrossFlagsAndKeys(t *testing.T) {
	distribution := map[string]int64{"a": 25, "b": 25, "c": 25, "d": 25}

	for _, flagKey := range []string{"flag-a", "flag-b", "flag-c"} {
		for i := range 50 {
			key := fmt.Sprintf("user-%d", i)
			want := featureflag.AssignByWeightedDistribution(flagKey, key, distribution)

			require.NotEmpty(t, want)
			for range 3 {
				require.Equal(t, want, featureflag.AssignByWeightedDistribution(flagKey, key, distribution))
			}
		}
	}
}
