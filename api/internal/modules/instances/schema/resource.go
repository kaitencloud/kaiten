package schema

import (
	"math"
	"time"
)

// UsageResources is what a RESOURCE entitlement's usage says about the counters
// behind it, which its value (the highest of them) hides. Both numbers are read
// at the instant of the read: a counter whose usage window has closed is still
// a resource, and no longer at its limit.
type UsageResources struct {
	Count   int32 `json:"count" doc:"How many resources hold a counter for this entitlement on this instance, whatever their usage window. This is what the ceiling of resources (KAITEN_USAGE_MAX_RESOURCES) counts." example:"6"`
	AtLimit int32 `json:"atLimit" doc:"How many of them have reached the limit in their current usage window: a counter at or above the limit. 0 when the limit is unlimited (-1)." example:"2"`
}

// NewUsageResources is the block a RESOURCE entitlement's usage carries, from what
// the read counted: the resources that hold a counter, and those among them at
// or above the limit in the window the pair's row belongs to. stale says that
// window has closed: the usage then reads as zero, and no counter of it is at
// its limit now, whatever it held then.
func NewUsageResources(count, atLimit int64, stale bool) *UsageResources {
	if stale {
		atLimit = 0
	}
	return &UsageResources{Count: clampInt32(count), AtLimit: clampInt32(atLimit)}
}

// clampInt32 narrows a count the ceiling of resources keeps far below the limit
// of an int32.
func clampInt32(n int64) int32 {
	return int32(max(0, min(n, math.MaxInt32)))
}

// EntitlementResource is one counter of a RESOURCE entitlement on an instance,
// as listEntitlementResources returns it. The limit it is measured against is
// the entitlement's own, which the entitlement's usage carries once for all of
// them.
type EntitlementResource struct {
	ResourceKey string `json:"resourceKey" doc:"The vendor's own identifier for the object: 1 to 128 characters of [A-Za-z0-9._:-], matched exactly and case-sensitively." example:"stigg"`
	// Value is the counter in the current usage window: zero when the stored
	// counter belongs to a window that has closed, exactly as a read of the
	// resource's usage answers.
	Value              NumberEntitlementValue `json:"value" doc:"The resource's counter in the current usage window: zero when its last report was in a window that has since closed."`
	CurrentPeriodStart *time.Time             `json:"currentPeriodStart,omitempty" doc:"Start of the current usage window (inclusive). Absent for a lifetime entitlement (no configured reset period)." example:"2026-03-01T00:00:00Z"`
	CurrentPeriodEnd   *time.Time             `json:"currentPeriodEnd,omitempty" doc:"End of the current usage window (exclusive). Absent for a lifetime entitlement (no configured reset period)." example:"2026-04-01T00:00:00Z"`
}
