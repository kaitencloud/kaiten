// Package period is the single shared implementation of periodic usage
// window arithmetic for NUMBER entitlements. It contains no persistence,
// transport, HTTP, or GraphQL logic -- it is pure window math, shared by
// every usage read path and the usage report path so window boundaries are
// never computed twice.
package period

import (
	"fmt"
	"time"
)

// ResetPeriod is the cadence at which a NUMBER entitlement's usage window
// resets. It belongs to the catalogue entitlement, not the contract/grant.
type ResetPeriod string

const (
	Hour  ResetPeriod = "HOUR"
	Day   ResetPeriod = "DAY"
	Week  ResetPeriod = "WEEK"
	Month ResetPeriod = "MONTH"
	Year  ResetPeriod = "YEAR"
)

// Valid reports whether p is one of the supported cadences.
func (p ResetPeriod) Valid() bool {
	switch p {
	case Hour, Day, Week, Month, Year:
		return true
	default:
		return false
	}
}

// ResetAnchor determines the phase of a periodic usage window: aligned to
// the UTC calendar (Calendar) or phased off the instance's license start
// date (LicenseStart).
type ResetAnchor string

const (
	Calendar     ResetAnchor = "CALENDAR"
	LicenseStart ResetAnchor = "LICENSE_START"
)

// Valid reports whether a is one of the supported anchors.
func (a ResetAnchor) Valid() bool {
	switch a {
	case Calendar, LicenseStart:
		return true
	default:
		return false
	}
}

// Window is a usage period [Start, End): Start is inclusive, End is
// exclusive. A timestamp landing exactly on End belongs to the next Window,
// not this one.
type Window struct {
	Start time.Time
	End   time.Time
}

// Current returns the window containing now for the given cadence/anchor.
// now (and licenseStart, when resetAnchor is LicenseStart) must be database
// time, not application-node wall clock, so reads and reports computed on
// different replicas always agree on window boundaries.
func Current(now time.Time, resetPeriod ResetPeriod, resetAnchor ResetAnchor, licenseStart time.Time) (Window, error) {
	return windowContaining(now.UTC(), resetPeriod, resetAnchor, licenseStart.UTC())
}

// ResolveCurrent returns the window a stored usage bucket is read and
// written in at now. It is Current(now) except in one case: the bucket's
// stored window starts after Current(now) and is itself a window of this
// cadence, anchor and licenseStart. Such a bucket was opened by a report
// whose clock had already passed a boundary that now has not reached yet --
// a database clock that stepped back across a failover, or a report that
// read the clock before waiting for the pair's lock. That window is then
// kept as the current one: reading it as stale would show 0 for usage that
// was counted, and rolling it over would mean walking forward from a window
// that is already ahead of now, which never meets now's window.
//
// A stored start that is not a window boundary under the current
// configuration is a phase shift (start_license_date or the anchor changed
// since the bucket was written), not a clock lead: Current(now) applies and
// the report path closes the old bucket. A nil storedPeriodStart (no stored
// row, or a lifetime bucket) also gets Current(now).
//
// storedAhead reports whether the stored window was kept.
func ResolveCurrent(now time.Time, storedPeriodStart *time.Time, resetPeriod ResetPeriod, resetAnchor ResetAnchor, licenseStart time.Time) (window Window, storedAhead bool, err error) {
	current, err := Current(now, resetPeriod, resetAnchor, licenseStart)
	if err != nil {
		return Window{}, false, err
	}
	if storedPeriodStart == nil || !storedPeriodStart.After(current.Start) {
		return current, false, nil
	}

	stored, err := Current(*storedPeriodStart, resetPeriod, resetAnchor, licenseStart)
	if err != nil {
		return Window{}, false, err
	}
	if !stored.Start.Equal(*storedPeriodStart) {
		return current, false, nil
	}
	return stored, true, nil
}

// Next returns the window immediately following w for the same
// cadence/anchor/licenseStart. It is evaluated at w.End using the same
// arithmetic as Current, so windows are always contiguous: Next(w).Start is
// always equal to w.End, with no gap and no overlap.
func Next(w Window, resetPeriod ResetPeriod, resetAnchor ResetAnchor, licenseStart time.Time) (Window, error) {
	return windowContaining(w.End.UTC(), resetPeriod, resetAnchor, licenseStart.UTC())
}

func windowContaining(t time.Time, resetPeriod ResetPeriod, resetAnchor ResetAnchor, licenseStart time.Time) (Window, error) {
	switch resetAnchor {
	case Calendar:
		return calendarWindow(t, resetPeriod)
	case LicenseStart:
		return licenseStartWindow(t, resetPeriod, licenseStart)
	default:
		return Window{}, fmt.Errorf("period: unsupported reset anchor %q", resetAnchor)
	}
}

// calendarWindow computes UTC-calendar-aligned windows. Only Month and Year
// involve variable-length periods, and both start on day 1 (of the month, or
// of January), so no day-of-month clamping is ever needed here -- clamping
// only arises under LicenseStart, where the anchor day is arbitrary.
func calendarWindow(t time.Time, resetPeriod ResetPeriod) (Window, error) {
	switch resetPeriod {
	case Hour:
		start := time.Date(t.Year(), t.Month(), t.Day(), t.Hour(), 0, 0, 0, time.UTC)
		return Window{Start: start, End: start.Add(time.Hour)}, nil
	case Day:
		start := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
		return Window{Start: start, End: start.AddDate(0, 0, 1)}, nil
	case Week:
		day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
		// ISO weekday: Monday=1 ... Sunday=7; time.Weekday has Sunday=0.
		weekday := int(day.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		start := day.AddDate(0, 0, -(weekday - 1))
		return Window{Start: start, End: start.AddDate(0, 0, 7)}, nil
	case Month:
		start := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
		return Window{Start: start, End: start.AddDate(0, 1, 0)}, nil
	case Year:
		start := time.Date(t.Year(), time.January, 1, 0, 0, 0, 0, time.UTC)
		return Window{Start: start, End: start.AddDate(1, 0, 0)}, nil
	default:
		return Window{}, fmt.Errorf("period: unsupported reset period %q", resetPeriod)
	}
}

// licenseStartWindow computes windows phased off anchor (instance.start_license_date).
// Hour/Day/Week are fixed-length durations, so their window index is a plain
// floor division. Month/Year are calendar periods of variable length, so
// their window index is found by monotonic search over clamped calendar
// arithmetic.
func licenseStartWindow(t time.Time, resetPeriod ResetPeriod, anchor time.Time) (Window, error) {
	switch resetPeriod {
	case Hour:
		return fixedDurationWindow(t, anchor, time.Hour), nil
	case Day:
		return fixedDurationWindow(t, anchor, 24*time.Hour), nil
	case Week:
		return fixedDurationWindow(t, anchor, 7*24*time.Hour), nil
	case Month:
		n := monthIndex(anchor, t)
		return Window{Start: addMonthsClamped(anchor, n), End: addMonthsClamped(anchor, n+1)}, nil
	case Year:
		n := yearIndex(anchor, t)
		return Window{Start: addYearsClamped(anchor, n), End: addYearsClamped(anchor, n+1)}, nil
	default:
		return Window{}, fmt.Errorf("period: unsupported reset period %q", resetPeriod)
	}
}

// fixedDurationWindow handles Hour/Day/Week under LicenseStart: these are
// fixed-length periods (UTC has no DST), so the window index is a simple
// floor division of elapsed time by the period length. Negative indexes
// (t before anchor) fall out naturally from floor division.
func fixedDurationWindow(t, anchor time.Time, periodLen time.Duration) Window {
	elapsed := t.Sub(anchor)
	n := int64(elapsed / periodLen)
	if elapsed%periodLen != 0 && elapsed < 0 {
		n--
	}
	start := anchor.Add(time.Duration(n) * periodLen)
	return Window{Start: start, End: start.Add(periodLen)}
}

// monthIndex finds the (possibly negative) window index n such that
// addMonthsClamped(anchor, n) <= t < addMonthsClamped(anchor, n+1).
// addMonthsClamped is strictly monotonic increasing in n, so a naive
// estimate corrected by a short linear walk always converges.
func monthIndex(anchor, t time.Time) int64 {
	n := int64(t.Year()-anchor.Year())*12 + int64(t.Month()-anchor.Month())
	for !addMonthsClamped(anchor, n+1).After(t) {
		n++
	}
	for addMonthsClamped(anchor, n).After(t) {
		n--
	}
	return n
}

// yearIndex is monthIndex's counterpart for Year, using the same
// monotonic-search technique.
func yearIndex(anchor, t time.Time) int64 {
	n := int64(t.Year() - anchor.Year())
	for !addYearsClamped(anchor, n+1).After(t) {
		n++
	}
	for addYearsClamped(anchor, n).After(t) {
		n--
	}
	return n
}

// addMonthsClamped adds n months to t, clamping the day-of-month to the
// target month's last day when necessary (e.g. Jan 31 + 1 month = Feb 28).
// Clamping is evaluated fresh from t's original day every time, not
// carried forward from a previously clamped result, so the day reverts to
// the anchor's day-of-month as soon as the target month is long enough
// again (Jan 31 -> Feb 28 -> Mar 31, not Mar 28).
func addMonthsClamped(t time.Time, n int64) time.Time {
	totalMonths := int64(t.Year())*12 + int64(t.Month()-1) + n
	year := int(totalMonths / 12)
	monthIdx := int(totalMonths % 12)
	if monthIdx < 0 {
		monthIdx += 12
		year--
	}
	month := time.Month(monthIdx + 1)
	day := clampDay(year, month, t.Day())
	return time.Date(year, month, day, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), time.UTC)
}

// addYearsClamped is addMonthsClamped's counterpart for Year, clamping Feb
// 29 down to Feb 28 in non-leap target years and reverting to 29 as soon as
// the target year is leap again.
func addYearsClamped(t time.Time, n int64) time.Time {
	year := t.Year() + int(n)
	day := clampDay(year, t.Month(), t.Day())
	return time.Date(year, t.Month(), day, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), time.UTC)
}

func clampDay(year int, month time.Month, day int) int {
	if maxDay := daysInMonth(year, month); day > maxDay {
		return maxDay
	}
	return day
}

func daysInMonth(year int, month time.Month) int {
	// Day 0 of the following month is the last day of this one.
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}
