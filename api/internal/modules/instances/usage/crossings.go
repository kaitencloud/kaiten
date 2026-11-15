package usage

import entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"

// CrossingKind names a boundary an accepted report took the counter to or
// across.
type CrossingKind int

const (
	// Reached: the counter landed exactly on the threshold. Fires on every
	// report that lands there, not only the first.
	Reached CrossingKind = iota + 1
	// CapExceeded: the counter went from below the threshold to above it.
	CapExceeded
	// Warning: the counter went from below the warning boundary to at or
	// above it.
	Warning
)

// Crossing is one boundary crossed, with the boundary's value.
type Crossing struct {
	Kind     CrossingKind
	Boundary float64
}

// Crossings returns the boundaries a report crossed going from before to
// after, in the order their events are emitted: the cap signal (Reached or
// CapExceeded, never both), then Warning. An unlimited
// grant has none. A crossing fires once per crossing, so a counter already
// past a boundary does not fire it again until a rollover brings it back
// under.
func Crossings(l Limit, warningPercent int32, before, after float64) []Crossing {
	if l.Unlimited() {
		return nil
	}
	var crossings []Crossing
	switch {
	case after == l.Threshold:
		crossings = append(crossings, Crossing{Kind: Reached, Boundary: l.Threshold})
	case after > l.Threshold && entitlementvalue.Crossed(before, after, l.Threshold):
		crossings = append(crossings, Crossing{Kind: CapExceeded, Boundary: l.Threshold})
	}
	if warningPercent > 0 {
		boundary := entitlementvalue.WarningBoundary(l.Threshold, warningPercent)
		if entitlementvalue.Crossed(before, after, boundary) {
			crossings = append(crossings, Crossing{Kind: Warning, Boundary: boundary})
		}
	}
	return crossings
}
