package usage

import (
	"context"
	"errors"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
)

// Periodicity is an entitlement's reset configuration, read against the
// instance's license start. A nil *Periodicity is a lifetime counter.
type Periodicity struct {
	ResetPeriod  period.ResetPeriod
	ResetAnchor  period.ResetAnchor
	LicenseStart time.Time
	Basis        period.Basis
}

// PeriodicityOf builds the reset configuration from an entitlement row's
// nullable reset columns, whatever string type the reading package's
// generated code gives them: nil (a lifetime counter) when no reset period
// is configured.
func PeriodicityOf[P, A ~string](resetPeriod *P, resetAnchor *A, licenseStart time.Time) *Periodicity {
	if resetPeriod == nil || resetAnchor == nil {
		return nil
	}
	return &Periodicity{
		ResetPeriod:  period.ResetPeriod(*resetPeriod),
		ResetAnchor:  period.ResetAnchor(*resetAnchor),
		LicenseStart: licenseStart,
	}
}

// PeriodicityOn carries the subscription facts read under the report lock.
func PeriodicityOn[P, A ~string](resetPeriod *P, resetAnchor *A, basis period.Basis) *Periodicity {
	p := PeriodicityOf(resetPeriod, resetAnchor, basis.LicenseStart)
	if p != nil {
		p.Basis = basis
	}
	return p
}

func (p *Periodicity) basis() period.Basis {
	b := p.Basis
	b.LicenseStart = p.LicenseStart
	return b
}

// Stored is the pair's entitlement_usage row as it was read under the lock.
// Present is false before the first report.
type Stored struct {
	Present     bool
	Counter     Counter
	PeriodStart *time.Time // nil for a lifetime bucket
}

// Window is the usage window a report lands in. Start and End are nil for a
// lifetime counter, which is also how the response's currentPeriodStart/End
// say "lifetime".
type Window struct {
	Start *time.Time
	End   *time.Time
}

// Resolution is where the stored counter stands at now: the window that is
// open, the counter inside it, and the windows a report has to close to get
// there. Closures is empty unless the stored row belongs to an older window.
type Resolution struct {
	Window   Window
	Current  Counter
	Closures []Closure
}

// Stale reports whether the stored row has to be rolled over before
// anything is folded into it.
func (r Resolution) Stale() bool { return len(r.Closures) > 0 }

// CurrentWindow returns the window containing now, or the lifetime window
// when p is nil.
func CurrentWindow(now time.Time, p *Periodicity) (Window, error) {
	if p == nil {
		return Window{}, nil
	}
	w, err := period.CurrentOn(now, p.ResetPeriod, p.ResetAnchor, p.basis())
	if err != nil {
		return Window{}, err
	}
	return Window{Start: &w.Start, End: &w.End}, nil
}

// InWindow is the read side's lazy view of a stored counter: the stored
// value when it belongs to w, zero otherwise -- a stale prior window, a
// legacy lifetime row of a now-periodic entitlement, or no row at all. A
// read never writes; the stale row stays until a report rolls it over.
func InWindow(stored Stored, w Window) Counter {
	if !stored.Present {
		return Zero()
	}
	if w.Start == nil {
		return stored.Counter
	}
	if stored.PeriodStart != nil && stored.PeriodStart.Equal(*w.Start) {
		return stored.Counter
	}
	return Zero()
}

// Resolve is the report side of InWindow: the same current counter, plus
// the closures that bring a stale row up to the open window. A lifetime
// counter is never stale. A periodic entitlement with no stored row has
// nothing to close.
const DefaultMaxRolloverClosures = 100_000

var ErrRolloverLimitExceeded = errors.New("rollover: more windows to close than the configured cap")

func Resolve(now time.Time, p *Periodicity, stored Stored) (Resolution, error) {
	return ResolveWithLimit(context.Background(), DefaultMaxRolloverClosures, now, p, stored)
}
func ResolveWithLimit(ctx context.Context, maxClosures int, now time.Time, p *Periodicity, stored Stored) (Resolution, error) {
	w, err := CurrentWindow(now, p)
	if err != nil {
		return Resolution{}, err
	}
	res := Resolution{Window: w, Current: InWindow(stored, w)}
	if p == nil || !stored.Present {
		return res, nil
	}
	if stored.PeriodStart != nil && stored.PeriodStart.Equal(*w.Start) {
		return res, nil
	}
	// A database clock can step back across a boundary. An aligned stored
	// window ahead of now stays current: rolling forward from it can never
	// reach the earlier window, and resetting it would lose accepted usage.
	if stored.PeriodStart != nil && stored.PeriodStart.After(*w.Start) {
		storedWindow, err := CurrentWindow(*stored.PeriodStart, p)
		if err != nil {
			return Resolution{}, err
		}
		if storedWindow.Start.Equal(*stored.PeriodStart) {
			return Resolution{Window: storedWindow, Current: stored.Counter}, nil
		}
	}
	closures, err := planRollover(
		ctx, maxClosures,
		stored.PeriodStart, stored.Counter.Value, stored.Counter.EventCount,
		period.Window{Start: *w.Start, End: *w.End}, p.ResetPeriod, p.ResetAnchor, p.basis(),
	)
	if err != nil {
		return Resolution{}, err
	}
	res.Closures = closures
	return res, nil
}

// Closure is one closed usage window, materialized as one
// INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER event. ClosedPeriodStart/End
// are nil when the closed window's boundaries cannot be reconstructed
// (lifetime-to-period adoption, or a license-start phase change since the
// bucket was stored) -- the closure is still real and still finalizes
// whatever value was stored, but its own window shape is unknown.
type Closure struct {
	ClosedPeriodStart *time.Time
	ClosedPeriodEnd   *time.Time
	Value             float64
	EventCount        int32
	NewPeriodStart    time.Time
	IsSynthetic       bool
	Reason            string
}

const (
	ReasonPeriodEnded   = "PERIOD_ENDED"
	ReasonAnchorChanged = "ANCHOR_CHANGED"
)

// planRollover computes the ordered sequence of window closures needed to
// bring a stale stored bucket up to currentWindow. Callers must only invoke
// this once stored.period_start != currentWindow.Start has already been
// established -- this function does not check that itself.
//
// storedPeriodStart nil means the stored value accumulated as a lifetime
// counter before periodic reset was configured. storedValue/storedEventCount
// are the stored row's current value.
//
// The result always has at least one closure and always ends with a
// closure whose NewPeriodStart equals currentWindow.Start.
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
) ([]Closure, error) {
	if storedPeriodStart == nil {
		// Lifetime-to-period adoption: there is no window to reconstruct the
		// old bucket's boundaries from, so its end is not derivable.
		return []Closure{{
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
		return []Closure{{
			ClosedPeriodStart: &closedStart,
			ClosedPeriodEnd:   changeInstant(resetAnchor, basis, closedStart),
			Value:             storedValue,
			EventCount:        storedEventCount,
			NewPeriodStart:    currentWindow.Start,
			IsSynthetic:       false,
			Reason:            ReasonAnchorChanged,
		}}, nil
	}

	var closures []Closure
	closingWindow := storedWindow
	first := true
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if len(closures) >= maxClosures {
			return nil, ErrRolloverLimitExceeded
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
		closures = append(closures, Closure{
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
