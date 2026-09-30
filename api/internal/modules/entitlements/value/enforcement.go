package value

import "fmt"

// UnlimitedOveragePercent is the sentinel a limit_cap_exceeded_overage_percent
// must carry exactly when its threshold is the unlimited sentinel (see
// UnlimitedThreshold): there is no cap, so there is no overage to bound.
const UnlimitedOveragePercent = int32(-1)

// ValidateLimitCapExceededOveragePercent enforces the coupling between a
// license entitlement's numeric threshold and its overage percent -- the
// single invariant that makes enforcement fully derivable from those two
// values, with no separate hard/soft/unlimited flag:
//
//   - threshold unlimited (UnlimitedThreshold): overagePercent must be
//     exactly UnlimitedOveragePercent. Any other value is invalid -- there is
//     no cap to exceed.
//   - threshold not unlimited: overagePercent must be >= 0. 0 means a hard
//     limit (no overage allowed); a positive value means a soft limit,
//     allowing usage to exceed threshold by that percentage.
func ValidateLimitCapExceededOveragePercent(threshold float64, overagePercent int32) error {
	if IsUnlimitedThreshold(threshold) {
		if overagePercent != UnlimitedOveragePercent {
			return fmt.Errorf("limitCapExceededOveragePercent must be %d when the entitlement value is unlimited", UnlimitedOveragePercent)
		}
		return nil
	}
	if overagePercent < 0 {
		return fmt.Errorf("limitCapExceededOveragePercent must be %d (unlimited) or >= 0", UnlimitedOveragePercent)
	}
	return nil
}

// DefaultLimitCapExceededOveragePercent resolves the overage percent a
// caller gets by leaving it unspecified: UnlimitedOveragePercent when
// threshold is itself unlimited, 0 (hard limit) otherwise -- preserving the
// pre-existing hard-by-default behavior for a caller that only sets a
// threshold.
func DefaultLimitCapExceededOveragePercent(threshold float64) int32 {
	if IsUnlimitedThreshold(threshold) {
		return UnlimitedOveragePercent
	}
	return 0
}

// IsHardLimit reports whether usage beyond threshold is rejected outright: a
// capped threshold with no configured overage allowance.
func IsHardLimit(threshold float64, overagePercent int32) bool {
	return !IsUnlimitedThreshold(threshold) && overagePercent == 0
}

// IsSoftLimit reports whether usage may exceed threshold, up to
// MaximumAllowedUsage, before being rejected.
func IsSoftLimit(threshold float64, overagePercent int32) bool {
	return !IsUnlimitedThreshold(threshold) && overagePercent > 0
}

// MaximumAllowedUsage returns the highest usage value threshold and
// overagePercent together permit: threshold itself for a hard limit (0),
// threshold inflated by overagePercent for a soft one. Mirrors
// WarningBoundary's arithmetic, so the two stay consistent as threshold- and
// percent-derived boundaries.
//
// Callers must check IsUnlimitedThreshold first -- an unlimited threshold has
// no maximum, and this function does not encode that sentinel.
func MaximumAllowedUsage(threshold float64, overagePercent int32) float64 {
	return threshold + threshold*float64(overagePercent)/100
}
