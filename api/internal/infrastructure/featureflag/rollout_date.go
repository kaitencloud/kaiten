package featureflag

import (
	"math"
	"time"
)

// ResolveRolloutDate resolves the variant for a time-based gradual rollout:
// startVariant before startDate, endVariant after endDate, and a
// progressively-increasing chance of endVariant in between, keyed by
// flagKey and targetingKey so a given caller always lands on the same side of
// the threshold until the percentage itself moves — and on a different side
// per flag (see bucketOf).
func ResolveRolloutDate(
	flagKey, targetingKey string,
	startPercent, endPercent float64,
	startDate, endDate time.Time,
	startVariant, endVariant string,
) string {
	now := time.Now()

	// Before start date
	if now.Before(startDate) {
		return startVariant
	}

	// After end date
	if now.After(endDate) {
		return endVariant
	}

	// Between dates: progressive calculation. `percent` is how far the rollout
	// has progressed toward endVariant (it ramps from startPercent to
	// endPercent), but AssignByGradualRollout's rolloutPercent is the share
	// landing on its *first* variant argument — so endVariant goes first here,
	// or a config written the natural way (0% -> 100%, old -> new) would roll
	// out backwards, starting mostly on the new variant and ending mostly on
	// the old one.
	percent := computeRolloutPercentage(startPercent, endPercent, startDate, endDate, now)
	percent = math.Max(0, math.Min(100, percent))

	return AssignByGradualRollout(flagKey, targetingKey, percent, endVariant, startVariant)
}
