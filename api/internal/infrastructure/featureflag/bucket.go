package featureflag

import (
	"sort"

	"github.com/cespare/xxhash/v2"
)

const (
	bucketGranularity = 10000 // Unified granularity for consistent hash distribution

	// bucketSaltSeparator keeps ("ab", "c") and ("a", "bc") in different
	// buckets, so one flag's key cannot be chosen to reproduce another
	// flag's split.
	bucketSaltSeparator = "\x00"
)

// AssignByGradualRollout handles time-based gradual rollouts
// Returns startVariant if the subject falls within rolloutPercent, otherwise endVariant
func AssignByGradualRollout(flagKey, targetingKey string, rolloutPercent float64, startVariant, endVariant string) string {
	threshold := uint64(rolloutPercent * float64(bucketGranularity) / 100.0)

	if bucketOf(flagKey, targetingKey) < threshold {
		return startVariant
	}
	return endVariant
}

// AssignByWeightedDistribution handles multi-variant weighted distribution
// Returns variant based on weight ratios, or defaultVariant if no valid variants
func AssignByWeightedDistribution(flagKey, targetingKey string, variants map[string]int64) string {
	if len(variants) == 0 {
		return ""
	}

	type variantWeight struct {
		Name   string
		Weight int64
	}

	var variantList []variantWeight
	var totalWeight int64

	// Filter positive weights and calculate total
	for name, weight := range variants {
		if weight > 0 {
			variantList = append(variantList, variantWeight{name, weight})
			totalWeight += weight
		}
	}

	if totalWeight == 0 {
		return ""
	}

	// Sort for deterministic ordering
	sort.Slice(variantList, func(i, j int) bool {
		return variantList[i].Name < variantList[j].Name
	})

	bucket := float64(bucketOf(flagKey, targetingKey)) / float64(bucketGranularity) * 100.0

	var cumulative float64
	for _, v := range variantList {
		cumulative += float64(v.Weight) / float64(totalWeight) * 100.0
		if bucket < cumulative {
			return v.Name
		}
	}

	return ""
}

/*
bucketOf places a subject in one of bucketGranularity buckets, for one flag.

The flag key is the salt, and it is the whole point of this function existing
rather than the hash being written inline. Hashing the targeting key alone —
which is what this did — gives every flag the identical split of the
population: a subject in the first 10% of one rollout is in the first 10% of
every rollout. Two things follow. Staged rollouts stop being independent, so
the same unlucky cohort receives every new feature first; and a percentage
split measures nothing, because its two arms are the same two arms as the last
experiment's.

Salting fixes both, and it must be the flag key rather than anything random:
the assignment has to be stable for a given (flag, subject) pair across
processes, restarts and deployments, or a caller's variant would change under
it between two requests.
*/
func bucketOf(flagKey, targetingKey string) uint64 {
	digest := xxhash.New()
	_, _ = digest.WriteString(flagKey)
	_, _ = digest.WriteString(bucketSaltSeparator)
	_, _ = digest.WriteString(targetingKey)

	return digest.Sum64() % bucketGranularity
}
