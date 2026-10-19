package usage

import (
	"testing"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
)

func mustParse(t *testing.T, s string) time.Time {
	t.Helper()
	tm, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatalf("mustParse(%q): %v", s, err)
	}
	return tm
}

func mustWindow(t *testing.T, at string, resetPeriod period.ResetPeriod, resetAnchor period.ResetAnchor, licenseStart time.Time) period.Window {
	t.Helper()
	w, err := period.Current(mustParse(t, at), resetPeriod, resetAnchor, licenseStart)
	if err != nil {
		t.Fatalf("period.Current: %v", err)
	}
	return w
}

func TestPlanRollover_AdjacentWindow_SingleRealClosure(t *testing.T) {
	current := mustWindow(t, "2026-08-15T00:00:00Z", period.Month, period.Calendar, time.Time{})
	julyStart := mustParse(t, "2026-07-01T00:00:00Z")

	closures, err := planRollover(&julyStart, 87500, 42, current, period.Month, period.Calendar, time.Time{})
	if err != nil {
		t.Fatalf("planRollover() error = %v", err)
	}

	if len(closures) != 1 {
		t.Fatalf("len(closures) = %d, want 1", len(closures))
	}
	c := closures[0]
	if c.IsSynthetic {
		t.Error("first closure must not be synthetic")
	}
	if c.ClosedPeriodStart == nil || !c.ClosedPeriodStart.Equal(julyStart) {
		t.Errorf("ClosedPeriodStart = %v, want %v", c.ClosedPeriodStart, julyStart)
	}
	wantEnd := mustParse(t, "2026-08-01T00:00:00Z")
	if c.ClosedPeriodEnd == nil || !c.ClosedPeriodEnd.Equal(wantEnd) {
		t.Errorf("ClosedPeriodEnd = %v, want %v", c.ClosedPeriodEnd, wantEnd)
	}
	if c.Value != 87500 || c.EventCount != 42 {
		t.Errorf("Value/EventCount = %v/%v, want 87500/42", c.Value, c.EventCount)
	}
	if !c.NewPeriodStart.Equal(current.Start) {
		t.Errorf("NewPeriodStart = %v, want %v", c.NewPeriodStart, current.Start)
	}
}

func TestPlanRollover_SkippedWindows_MaterializesEmptyOnes(t *testing.T) {
	// The user's own example: latest stored report is February, next report
	// is May -- March and April must each get their own zero closure.
	current := mustWindow(t, "2026-05-10T00:00:00Z", period.Month, period.Calendar, time.Time{})
	febStart := mustParse(t, "2026-02-01T00:00:00Z")

	closures, err := planRollover(&febStart, 1000, 7, current, period.Month, period.Calendar, time.Time{})
	if err != nil {
		t.Fatalf("planRollover() error = %v", err)
	}

	if len(closures) != 3 {
		t.Fatalf("len(closures) = %d, want 3 (Feb real + Mar, Apr synthetic)", len(closures))
	}

	feb, mar, apr := closures[0], closures[1], closures[2]

	if feb.IsSynthetic {
		t.Error("February closure must be real (isSynthetic=false)")
	}
	if feb.Value != 1000 || feb.EventCount != 7 {
		t.Errorf("February Value/EventCount = %v/%v, want 1000/7", feb.Value, feb.EventCount)
	}
	if !feb.ClosedPeriodStart.Equal(febStart) {
		t.Errorf("February ClosedPeriodStart = %v, want %v", feb.ClosedPeriodStart, febStart)
	}
	if !feb.ClosedPeriodEnd.Equal(mustParse(t, "2026-03-01T00:00:00Z")) {
		t.Errorf("February ClosedPeriodEnd = %v, want 2026-03-01", feb.ClosedPeriodEnd)
	}

	for name, c := range map[string]Closure{"March": mar, "April": apr} {
		if !c.IsSynthetic {
			t.Errorf("%s closure must be synthetic (isSynthetic=true)", name)
		}
		if c.Value != 0 || c.EventCount != 0 {
			t.Errorf("%s Value/EventCount = %v/%v, want 0/0", name, c.Value, c.EventCount)
		}
	}

	if !mar.ClosedPeriodStart.Equal(mustParse(t, "2026-03-01T00:00:00Z")) {
		t.Errorf("March ClosedPeriodStart = %v, want 2026-03-01", mar.ClosedPeriodStart)
	}
	if !apr.ClosedPeriodStart.Equal(mustParse(t, "2026-04-01T00:00:00Z")) {
		t.Errorf("April ClosedPeriodStart = %v, want 2026-04-01", apr.ClosedPeriodStart)
	}
	if !apr.ClosedPeriodEnd.Equal(current.Start) {
		t.Errorf("April ClosedPeriodEnd = %v, want current window start %v", apr.ClosedPeriodEnd, current.Start)
	}
	if !apr.NewPeriodStart.Equal(current.Start) {
		t.Errorf("April NewPeriodStart = %v, want current window start %v", apr.NewPeriodStart, current.Start)
	}

	// Contiguity chain: each closure's NewPeriodStart is the next one's ClosedPeriodStart.
	for i := range len(closures) - 1 {
		if !closures[i].NewPeriodStart.Equal(*closures[i+1].ClosedPeriodStart) {
			t.Errorf("closures[%d].NewPeriodStart = %v, want closures[%d].ClosedPeriodStart = %v",
				i, closures[i].NewPeriodStart, i+1, *closures[i+1].ClosedPeriodStart)
		}
	}

	// Exactly one closure carries the real accumulated value.
	nonZero := 0
	for _, c := range closures {
		if c.Value != 0 || c.EventCount != 0 {
			nonZero++
		}
	}
	if nonZero != 1 {
		t.Errorf("closures with non-zero value = %d, want 1", nonZero)
	}
}

func TestPlanRollover_LifetimeAdoption_SingleNonDerivableClosure(t *testing.T) {
	current := mustWindow(t, "2026-08-15T00:00:00Z", period.Month, period.Calendar, time.Time{})

	closures, err := planRollover(nil, 250, 5, current, period.Month, period.Calendar, time.Time{})
	if err != nil {
		t.Fatalf("planRollover() error = %v", err)
	}

	if len(closures) != 1 {
		t.Fatalf("len(closures) = %d, want 1", len(closures))
	}
	c := closures[0]
	if c.ClosedPeriodStart != nil {
		t.Errorf("ClosedPeriodStart = %v, want nil", c.ClosedPeriodStart)
	}
	if c.ClosedPeriodEnd != nil {
		t.Errorf("ClosedPeriodEnd = %v, want nil", c.ClosedPeriodEnd)
	}
	if c.IsSynthetic {
		t.Error("lifetime-adoption closure must not be synthetic")
	}
	if c.Value != 250 || c.EventCount != 5 {
		t.Errorf("Value/EventCount = %v/%v, want 250/5", c.Value, c.EventCount)
	}
	if !c.NewPeriodStart.Equal(current.Start) {
		t.Errorf("NewPeriodStart = %v, want %v", c.NewPeriodStart, current.Start)
	}
}

func TestPlanRollover_PhaseShift_SingleNonDerivableClosure(t *testing.T) {
	// stored.period_start was computed under an old start_license_date; the
	// window it belongs to can no longer be reconstructed under the new one
	// (e.g. start_license_date moved), so the old boundary doesn't align to
	// any window start under the current configuration.
	newLicenseStart := mustParse(t, "2026-01-10T00:00:00Z")
	current := mustWindow(t, "2026-08-15T00:00:00Z", period.Month, period.LicenseStart, newLicenseStart)

	// Not aligned to any window boundary under newLicenseStart's monthly grid.
	staleStart := mustParse(t, "2026-06-17T00:00:00Z")

	closures, err := planRollover(&staleStart, 999, 3, current, period.Month, period.LicenseStart, newLicenseStart)
	if err != nil {
		t.Fatalf("planRollover() error = %v", err)
	}

	if len(closures) != 1 {
		t.Fatalf("len(closures) = %d, want 1", len(closures))
	}
	c := closures[0]
	if c.ClosedPeriodStart == nil || !c.ClosedPeriodStart.Equal(staleStart) {
		t.Errorf("ClosedPeriodStart = %v, want %v", c.ClosedPeriodStart, staleStart)
	}
	if c.ClosedPeriodEnd != nil {
		t.Errorf("ClosedPeriodEnd = %v, want nil (not derivable)", c.ClosedPeriodEnd)
	}
	if c.IsSynthetic {
		t.Error("phase-shift closure must not be synthetic")
	}
	if c.Value != 999 || c.EventCount != 3 {
		t.Errorf("Value/EventCount = %v/%v, want 999/3", c.Value, c.EventCount)
	}
	if !c.NewPeriodStart.Equal(current.Start) {
		t.Errorf("NewPeriodStart = %v, want %v", c.NewPeriodStart, current.Start)
	}
}

func TestPlanRollover_HourGranularity_SkippedWindows(t *testing.T) {
	current := mustWindow(t, "2026-01-01T05:00:00Z", period.Hour, period.Calendar, time.Time{})
	staleStart := mustParse(t, "2026-01-01T02:00:00Z")

	closures, err := planRollover(&staleStart, 10, 1, current, period.Hour, period.Calendar, time.Time{})
	if err != nil {
		t.Fatalf("planRollover() error = %v", err)
	}

	// 02:00 (real) -> 03:00 (synthetic) -> 04:00 (synthetic) -> current 05:00.
	if len(closures) != 3 {
		t.Fatalf("len(closures) = %d, want 3", len(closures))
	}
	if closures[len(closures)-1].NewPeriodStart != current.Start {
		t.Errorf("final NewPeriodStart = %v, want %v", closures[len(closures)-1].NewPeriodStart, current.Start)
	}
}

func TestResolve(t *testing.T) {
	monthly := &Periodicity{ResetPeriod: period.Month, ResetAnchor: period.Calendar}
	now := mustParse(t, "2026-08-15T00:00:00Z")
	august := mustParse(t, "2026-08-01T00:00:00Z")
	july := mustParse(t, "2026-07-01T00:00:00Z")
	may := mustParse(t, "2026-05-01T00:00:00Z")
	stored := Counter{Value: 42, EventCount: 3}

	t.Run("lifetime, no row: zero, lifetime window, nothing to close", func(t *testing.T) {
		res, err := Resolve(now, nil, Stored{})
		if err != nil {
			t.Fatal(err)
		}
		if res.Window.Start != nil || res.Window.End != nil || res.Current != Zero() || res.Stale() {
			t.Errorf("Resolve() = %+v", res)
		}
	})
	t.Run("lifetime, a row: the row, never stale", func(t *testing.T) {
		res, err := Resolve(now, nil, Stored{Present: true, Counter: stored})
		if err != nil {
			t.Fatal(err)
		}
		if res.Current != stored || res.Stale() {
			t.Errorf("Resolve() = %+v", res)
		}
	})
	t.Run("periodic, no row: zero in the open window, nothing to close", func(t *testing.T) {
		res, err := Resolve(now, monthly, Stored{})
		if err != nil {
			t.Fatal(err)
		}
		if !res.Window.Start.Equal(august) || res.Current != Zero() || res.Stale() {
			t.Errorf("Resolve() = %+v", res)
		}
	})
	t.Run("periodic, row in the open window: the row", func(t *testing.T) {
		res, err := Resolve(now, monthly, Stored{Present: true, Counter: stored, PeriodStart: &august})
		if err != nil {
			t.Fatal(err)
		}
		if res.Current != stored || res.Stale() {
			t.Errorf("Resolve() = %+v", res)
		}
	})
	t.Run("periodic, one window stale: zero, one real closure", func(t *testing.T) {
		res, err := Resolve(now, monthly, Stored{Present: true, Counter: stored, PeriodStart: &july})
		if err != nil {
			t.Fatal(err)
		}
		if res.Current != Zero() || len(res.Closures) != 1 || res.Closures[0].Value != 42 {
			t.Errorf("Resolve() = %+v", res)
		}
	})
	t.Run("periodic, three windows stale: one real and two synthetic closures", func(t *testing.T) {
		res, err := Resolve(now, monthly, Stored{Present: true, Counter: stored, PeriodStart: &may})
		if err != nil {
			t.Fatal(err)
		}
		if len(res.Closures) != 3 || res.Closures[0].IsSynthetic || !res.Closures[1].IsSynthetic || !res.Closures[2].IsSynthetic {
			t.Errorf("Resolve() closures = %+v", res.Closures)
		}
		if !res.Closures[2].NewPeriodStart.Equal(august) {
			t.Errorf("last closure opens %v, want %v", res.Closures[2].NewPeriodStart, august)
		}
	})
	t.Run("periodic, a lifetime row adopted: one closure with no bounds", func(t *testing.T) {
		res, err := Resolve(now, monthly, Stored{Present: true, Counter: stored})
		if err != nil {
			t.Fatal(err)
		}
		if len(res.Closures) != 1 || res.Closures[0].ClosedPeriodStart != nil || res.Closures[0].ClosedPeriodEnd != nil {
			t.Errorf("Resolve() closures = %+v", res.Closures)
		}
	})
}

func TestInWindow(t *testing.T) {
	august := mustParse(t, "2026-08-01T00:00:00Z")
	september := mustParse(t, "2026-09-01T00:00:00Z")
	july := mustParse(t, "2026-07-01T00:00:00Z")
	open := Window{Start: &august, End: &september}
	stored := Counter{Value: 7, EventCount: 1}

	if got := InWindow(Stored{Present: true, Counter: stored, PeriodStart: &august}, open); got != stored {
		t.Errorf("row of the open window: %+v", got)
	}
	if got := InWindow(Stored{Present: true, Counter: stored, PeriodStart: &july}, open); got != Zero() {
		t.Errorf("stale row reads zero: %+v", got)
	}
	if got := InWindow(Stored{Present: true, Counter: stored}, open); got != Zero() {
		t.Errorf("lifetime row of a periodic entitlement reads zero: %+v", got)
	}
	if got := InWindow(Stored{Present: true, Counter: stored}, Window{}); got != stored {
		t.Errorf("lifetime row, lifetime window: %+v", got)
	}
	if got := InWindow(Stored{}, open); got != Zero() {
		t.Errorf("no row reads zero: %+v", got)
	}
}

func TestResolve_StoredWindowAheadOfClock(t *testing.T) {
	now := mustParse(t, "2026-10-31T23:59:59Z")
	start := mustParse(t, "2026-11-01T00:00:00Z")
	stored := Stored{Present: true, PeriodStart: &start, Counter: Counter{Value: 12, EventCount: 3}}
	p := &Periodicity{ResetPeriod: period.Month, ResetAnchor: period.Calendar}
	got, err := Resolve(now, p, stored)
	if err != nil {
		t.Fatal(err)
	}
	if got.Current != stored.Counter || got.Stale() {
		t.Fatalf("clock regression must preserve the stored counter without closures: %+v", got)
	}
	end := mustParse(t, "2026-12-01T00:00:00Z")
	if got.Window.Start == nil || !got.Window.Start.Equal(start) || got.Window.End == nil || !got.Window.End.Equal(end) {
		t.Fatalf("clock regression must keep the stored window: %+v", got.Window)
	}
}
