package usage

import (
	"math"

	"github.com/shopspring/decimal"

	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
)

// WeightedLimit is a limit and the weight it counts at.
type WeightedLimit struct {
	Weight decimal.Decimal
	// Threshold is the limit as stored: -1 for unlimited.
	Threshold float64
}

// CombineLimits is the limit of a combined entitlement: the sum of each source's
// limit times its weight, exact. It is unlimited as soon as one source is, and
// then reads as the unlimited threshold, -1: a sum that has no ceiling on one
// side has none.
func CombineLimits(parts []WeightedLimit) (limit decimal.Decimal, unlimited bool) {
	for _, part := range parts {
		if entitlementvalue.IsUnlimitedThreshold(part.Threshold) {
			return decimal.NewFromFloat(entitlementvalue.UnlimitedThreshold), true
		}
		limit = limit.Add(part.Weight.Mul(decimal.NewFromFloat(part.Threshold)))
	}
	return limit, false
}

// CombinedSource is one source of a combined entitlement, as the instance reads
// it on its own: its counter in its window, and the limit it is granted.
type CombinedSource struct {
	Slug   string
	Weight decimal.Decimal
	// Counter is the source's usage in its current window, zero when nothing was
	// reported in it.
	Counter Counter
	// Threshold is the source's effective limit: -1 for unlimited.
	Threshold float64
	Window    Window
}

// CombinedPart is what one source counts for in a combined entitlement, before
// its weight: the source's own usage and limit.
type CombinedPart struct {
	Slug   string
	Weight decimal.Decimal
	Usage  float64
	Limit  float64
}

// Combined is a combined entitlement as one instance reads it.
type Combined struct {
	// Counter is the weighted sum of the sources' usage, and the sum of their
	// event counts.
	Counter Counter
	// Threshold is the weighted sum of their limits: -1 when one is unlimited.
	Threshold float64
	// Window is the one the sources share: lifetime when it has no start.
	Window Window
	Parts  []CombinedPart
}

// Combine is the weighted sum of the usage of the sources an instance is
// granted: Σ weight × usage, over Σ weight × limit, each exact. A source the
// instance is not granted is not in the sources: it counts for nothing, as one
// that has no usage. It answers false when none is granted, since a combined
// entitlement exists for an instance as soon as one of its sources is granted
// to it, and not before.
//
// Everything is summed as a decimal and converted to a float64 once, at the
// end: 0.4 × 3 reads 1.2, where adding float64 products reads
// 1.2000000000000002.
//
// The window is the sources': they share one by the rules a combined entitlement
// is written under, and are equal unless one source's stored window is ahead of
// the clock (see period.ResolveCurrent). The one that started last is the one
// that is open.
func Combine(sources []CombinedSource) (Combined, bool) {
	if len(sources) == 0 {
		return Combined{}, false
	}

	var (
		value  decimal.Decimal
		events int64
		window Window
	)
	limits := make([]WeightedLimit, 0, len(sources))
	parts := make([]CombinedPart, 0, len(sources))
	for _, source := range sources {
		value = value.Add(source.Weight.Mul(decimal.NewFromFloat(source.Counter.Value)))
		events += int64(source.Counter.EventCount)
		if source.Window.Start != nil && (window.Start == nil || source.Window.Start.After(*window.Start)) {
			window = source.Window
		}
		limits = append(limits, WeightedLimit{Weight: source.Weight, Threshold: source.Threshold})
		parts = append(parts, CombinedPart{Slug: source.Slug, Weight: source.Weight, Usage: source.Counter.Value, Limit: source.Threshold})
	}

	limit, _ := CombineLimits(limits)
	usage, _ := value.Float64()
	threshold, _ := limit.Float64()

	return Combined{
		Counter:   Counter{Value: usage, EventCount: int32(min(events, math.MaxInt32))},
		Threshold: threshold,
		Window:    window,
		Parts:     parts,
	}, true
}
