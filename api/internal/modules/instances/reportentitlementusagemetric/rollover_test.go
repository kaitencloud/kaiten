package reportentitlementusagemetric

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

	for name, c := range map[string]rolloverClosure{"March": mar, "April": apr} {
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
