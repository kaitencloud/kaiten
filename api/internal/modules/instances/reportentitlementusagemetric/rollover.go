package reportentitlementusagemetric

import (
	"context"
	"errors"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
)

// Reasons of a closure.
const (
	ReasonPeriodEnded   = "PERIOD_ENDED"
	ReasonAnchorChanged = "ANCHOR_CHANGED"
)

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
	Reason            string
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
	basis period.Basis,
) ([]rolloverClosure, error) {
	if storedPeriodStart == nil {
		// Lifetime-to-period adoption: there is no window to reconstruct the
		// old bucket's boundaries from, so its end is not derivable.
		return []rolloverClosure{{
			Value:          storedValue,
			EventCount:     storedEventCount,
			NewPeriodStart: currentWindow.Start,
			IsSynthetic:    false,
			Reason:         ReasonAnchorChanged,
		}}, nil
	}

	storedWindow, err := period.CurrentOn(*storedPeriodStart, resetPeriod, resetAnchor, basis)
	if err != nil {
		return nil, err
	}

	if !storedWindow.Start.Equal(*storedPeriodStart) {
		// The window configuration has shifted since this bucket was stored
		// -- the subscription a BILLING_PERIOD window follows became live,
		// converted, changed plan or ended, or start_license_date changed --
		// so stored.period_start is no window start of the current
		// configuration. One closure, ANCHOR_CHANGED, ends it at the instant
		// of the change when one marks it (§6.7 rule 6); the windows of the
		// new configuration that elapsed without a report are not
		// materialized.
		closedStart := *storedPeriodStart
		return []rolloverClosure{{
			ClosedPeriodStart: &closedStart,
			ClosedPeriodEnd:   changeInstant(resetAnchor, basis, closedStart),
			Value:             storedValue,
			EventCount:        storedEventCount,
			NewPeriodStart:    currentWindow.Start,
			IsSynthetic:       false,
			Reason:            ReasonAnchorChanged,
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

		nextWindow, err := period.NextOn(closingWindow, resetPeriod, resetAnchor, basis)
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
			Reason:            ReasonPeriodEnded,
		})

		if nextWindow.Start.Equal(currentWindow.Start) {
			return closures, nil
		}
		closingWindow = nextWindow
		first = false
	}
}

// changeInstant is the end of a window an anchor change closes (§6.7 rule
// 6): the live subscription's anchor_at, else live_ended_at, for a
// BILLING_PERIOD window; nil when that instant is not after the window's
// start, and when no instant marks the change (a start_license_date edit).
func changeInstant(resetAnchor period.ResetAnchor, basis period.Basis, start time.Time) *time.Time {
	if resetAnchor != period.BillingPeriod {
		return nil
	}
	instant := basis.LiveAnchor
	if instant == nil {
		instant = basis.LiveEndedAt
	}
	if instant == nil || !instant.After(start) {
		return nil
	}
	end := *instant
	return &end
}
