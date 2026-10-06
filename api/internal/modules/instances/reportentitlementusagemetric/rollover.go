package reportentitlementusagemetric

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
)

// InstanceEntitlementUsagePeriodRolledOver is the outbox payload for
// INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER. One is emitted per
// rolloverClosure -- see the events.InstanceEntitlementUsagePeriodRolledOver
// doc comment for what real vs. synthetic closures mean.
type InstanceEntitlementUsagePeriodRolledOver struct {
	EntitlementID     uuid.UUID  `json:"entitlement_id"`
	EntitlementSlug   string     `json:"entitlement_slug"`
	InstanceID        uuid.UUID  `json:"instance_id"`
	Value             float64    `json:"value"`
	EventCount        int32      `json:"event_count"`
	ClosedPeriodStart *time.Time `json:"closed_period_start"`
	ClosedPeriodEnd   *time.Time `json:"closed_period_end"`
	NewPeriodStart    time.Time  `json:"new_period_start"`
	IsSynthetic       bool       `json:"is_synthetic"`
}

// rolloverClosure is one closed usage window, materialized as one
// INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER event. ClosedPeriodStart/End
// are nil when the closed window's boundaries cannot be reconstructed
// (lifetime-to-period adoption, or a license-start phase change since the
// bucket was stored) -- the closure is still real and still finalizes
// whatever value was stored, but its own window shape is unknown.
type rolloverClosure struct {
	ClosedPeriodStart *time.Time
	ClosedPeriodEnd   *time.Time
	Value             float64
	EventCount        int32
	NewPeriodStart    time.Time
	IsSynthetic       bool
}

// DefaultMaxRolloverClosures is how many windows one report may close when
// the configuration says nothing: an HOUR entitlement dormant for 11 years.
const DefaultMaxRolloverClosures = 100_000

// errRolloverLimitExceeded means bringing the stored bucket up to date would
// close more windows than the configured cap. The report fails rather than
// hold the pair's lock while it materializes them.
var errRolloverLimitExceeded = errors.New("rollover: more windows to close than the configured cap")

// planRollover computes the ordered sequence of window closures needed to
// bring a stale stored bucket up to currentWindow. Callers must only invoke
// this once stored.period_start != currentWindow.Start has already been
// established -- this function does not check that itself.
//
// storedPeriodStart nil means the stored value accumulated as a lifetime
// counter before periodic reset was configured (or before any usage row
// existed at all -- callers with no stored row skip rollover planning
// entirely and initialize the new window directly, since there is nothing
// to close). storedValue/storedEventCount are only meaningful when
// storedPeriodStart is non-nil or a real lifetime bucket is being adopted;
// pass the stored row's current value either way.
//
// The result always has at least one closure and always ends with a
// closure whose NewPeriodStart equals currentWindow.Start. The walk stops
// with errRolloverLimitExceeded after maxClosures closures, and with ctx's
// error as soon as ctx is done: the caller holds the pair's lock and a
// transaction for as long as it runs.
func planRollover(
	ctx context.Context,
	maxClosures int,
	storedPeriodStart *time.Time,
	storedValue float64,
	storedEventCount int32,
	currentWindow period.Window,
	resetPeriod period.ResetPeriod,
	resetAnchor period.ResetAnchor,
	licenseStart time.Time,
) ([]rolloverClosure, error) {
	if storedPeriodStart == nil {
		// Lifetime-to-period adoption: there is no window to reconstruct the
		// old bucket's boundaries from, so its end is not derivable.
		return []rolloverClosure{{
			Value:          storedValue,
			EventCount:     storedEventCount,
			NewPeriodStart: currentWindow.Start,
			IsSynthetic:    false,
		}}, nil
	}

	storedWindow, err := period.Current(*storedPeriodStart, resetPeriod, resetAnchor, licenseStart)
	if err != nil {
		return nil, err
	}

	if !storedWindow.Start.Equal(*storedPeriodStart) {
		// The cadence/anchor/license-start configuration has shifted since
		// this bucket was stored (e.g. start_license_date changed), so
		// stored.period_start no longer aligns to any window boundary under
		// the current configuration. The old window's end is not derivable
		// under a phase it was never computed against -- same shape as the
		// lifetime-adoption case above, just with a known start.
		closedStart := *storedPeriodStart
		return []rolloverClosure{{
			ClosedPeriodStart: &closedStart,
			Value:             storedValue,
			EventCount:        storedEventCount,
			NewPeriodStart:    currentWindow.Start,
			IsSynthetic:       false,
		}}, nil
	}

	var closures []rolloverClosure
	closingWindow := storedWindow
	first := true
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if len(closures) >= maxClosures {
			return nil, errRolloverLimitExceeded
		}

		nextWindow, err := period.Next(closingWindow, resetPeriod, resetAnchor, licenseStart)
		if err != nil {
			return nil, err
		}

		value, eventCount := float64(0), int32(0)
		if first {
			value, eventCount = storedValue, storedEventCount
		}

		closedStart := closingWindow.Start
		closedEnd := closingWindow.End
		closures = append(closures, rolloverClosure{
			ClosedPeriodStart: &closedStart,
			ClosedPeriodEnd:   &closedEnd,
			Value:             value,
			EventCount:        eventCount,
			NewPeriodStart:    nextWindow.Start,
			IsSynthetic:       !first,
		})

		if nextWindow.Start.Equal(currentWindow.Start) {
			return closures, nil
		}
		closingWindow = nextWindow
		first = false
	}
}
