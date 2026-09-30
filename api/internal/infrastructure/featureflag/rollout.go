package featureflag

import "time"

// computeRolloutPercentage linearly interpolates the rollout percentage
// between (startDate, startPercent) and (endDate, endPercent) at now,
// clamping to the start/end percentage outside that range.
func computeRolloutPercentage(startPercent, endPercent float64, startDate, endDate, now time.Time) float64 {
	if now.Before(startDate) {
		return startPercent
	}
	if now.After(endDate) {
		return endPercent
	}

	total := endDate.Sub(startDate).Seconds()
	if total == 0 {
		return endPercent
	}

	elapsed := now.Sub(startDate).Seconds()
	return startPercent + (endPercent-startPercent)*elapsed/total
}
