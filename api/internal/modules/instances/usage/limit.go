package usage

import entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"

// Limit is the license grant a counter is measured against: the threshold
// (-1 for unlimited) and the grant's limit_cap_exceeded_overage_percent (-1
// unlimited, 0 hard, > 0 soft). Enforcement is derived from these two alone;
// there is no separate hard/soft/unlimited flag.
type Limit struct {
	Threshold      float64
	OveragePercent int32
}

// Unlimited reports whether the grant has no ceiling at all.
func (l Limit) Unlimited() bool { return entitlementvalue.IsUnlimitedThreshold(l.Threshold) }

// Maximum is the highest counter the grant admits: the threshold for a hard
// grant, the threshold plus its overage for a soft one. Meaningless when
// Unlimited.
func (l Limit) Maximum() float64 {
	return entitlementvalue.MaximumAllowedUsage(l.Threshold, l.OveragePercent)
}
