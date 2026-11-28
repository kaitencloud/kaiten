package usage

import (
	"math"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func weight(t *testing.T, s string) decimal.Decimal {
	t.Helper()
	d, err := decimal.NewFromString(s)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// TestCombine_ADRExample is the ADR's table: 1000 granted on each source, 300
// used of the one counted at 0.4 and 100 of the one counted at 0.6.
func TestCombine_ADRExample(t *testing.T) {
	got, ok := Combine([]CombinedSource{
		{Slug: "firecrawl-credits", Weight: weight(t, "0.4"), Counter: Counter{Value: 300, EventCount: 3}, Threshold: 1000},
		{Slug: "ai-credits", Weight: weight(t, "0.6"), Counter: Counter{Value: 100, EventCount: 2}, Threshold: 1000},
	})
	if !ok {
		t.Fatal("Combine() found nothing granted")
	}

	if got.Counter.Value != 180 || got.Threshold != 1000 {
		t.Errorf("the sum reads %v of %v, want 180 of 1000", got.Counter.Value, got.Threshold)
	}
	if len(got.Parts) != 2 {
		t.Fatalf("Parts = %+v, want one per source", got.Parts)
	}
	for i, want := range []CombinedPart{
		{Slug: "firecrawl-credits", Weight: weight(t, "0.4"), Usage: 300, Limit: 1000},
		{Slug: "ai-credits", Weight: weight(t, "0.6"), Usage: 100, Limit: 1000},
	} {
		part := got.Parts[i]
		if part.Slug != want.Slug || !part.Weight.Equal(want.Weight) || part.Usage != want.Usage || part.Limit != want.Limit {
			t.Errorf("Parts[%d] = %+v, want %+v", i, part, want)
		}
	}

	// Each source counts for its share: 120 of 400, and 60 of 600.
	counts := func(p CombinedPart) (float64, float64) {
		used, _ := p.Weight.Mul(decimal.NewFromFloat(p.Usage)).Float64()
		limit, _ := p.Weight.Mul(decimal.NewFromFloat(p.Limit)).Float64()
		return used, limit
	}
	if used, limit := counts(got.Parts[0]); used != 120 || limit != 400 {
		t.Errorf("firecrawl-credits counts for %v of %v, want 120 of 400", used, limit)
	}
	if used, limit := counts(got.Parts[1]); used != 60 || limit != 600 {
		t.Errorf("ai-credits counts for %v of %v, want 60 of 600", used, limit)
	}
}

// TestCombine_ExactDecimals: the sum is exact, the float64 only the last step.
// 0.4 x 3 is 1.2 where float64 arithmetic says 1.2000000000000002, and 0.1 + 0.2
// is 0.3 where it says 0.30000000000000004.
func TestCombine_ExactDecimals(t *testing.T) {
	got, _ := Combine([]CombinedSource{{Slug: "a-source", Weight: weight(t, "0.4"), Counter: Counter{Value: 3}, Threshold: 3}})
	if got.Counter.Value != 1.2 || got.Threshold != 1.2 {
		t.Errorf("0.4 x 3 reads %v of %v, want 1.2 of 1.2", got.Counter.Value, got.Threshold)
	}
	rate, used := 0.4, 3.0 // variables: a constant expression would be exact
	if naive := rate * used; naive == 1.2 {
		t.Fatalf("float64 0.4 x 3 is %v: the case no longer shows what it is for", naive)
	}

	got, _ = Combine([]CombinedSource{
		{Slug: "a-source", Weight: weight(t, "1"), Counter: Counter{Value: 0.1}, Threshold: 0.1},
		{Slug: "b-source", Weight: weight(t, "1"), Counter: Counter{Value: 0.2}, Threshold: 0.2},
	})
	if got.Counter.Value != 0.3 || got.Threshold != 0.3 {
		t.Errorf("0.1 + 0.2 reads %v of %v, want 0.3 of 0.3", got.Counter.Value, got.Threshold)
	}
}

// TestCombine_WeightsNeedNotAddUpToOne: a weight is a conversion rate.
func TestCombine_WeightsNeedNotAddUpToOne(t *testing.T) {
	got, _ := Combine([]CombinedSource{
		{Slug: "a-source", Weight: weight(t, "10"), Counter: Counter{Value: 5}, Threshold: 100},
		{Slug: "b-source", Weight: weight(t, "0.01"), Counter: Counter{Value: 500}, Threshold: 1000},
	})
	if got.Counter.Value != 55 || got.Threshold != 1010 {
		t.Errorf("reads %v of %v, want 55 of 1010", got.Counter.Value, got.Threshold)
	}
}

// TestCombine_UnlimitedWhenAnySourceUnlimited: a sum with no ceiling on one side
// has none, and the usage is still the sum.
func TestCombine_UnlimitedWhenAnySourceUnlimited(t *testing.T) {
	got, ok := Combine([]CombinedSource{
		{Slug: "a-source", Weight: weight(t, "0.4"), Counter: Counter{Value: 300}, Threshold: 1000},
		{Slug: "b-source", Weight: weight(t, "0.6"), Counter: Counter{Value: 100}, Threshold: -1},
	})
	if !ok {
		t.Fatal("Combine() found nothing granted")
	}
	if got.Threshold != -1 {
		t.Errorf("Threshold = %v, want -1: one unlimited source makes the sum unlimited", got.Threshold)
	}
	if got.Counter.Value != 180 {
		t.Errorf("usage = %v, want 180: still the weighted sum", got.Counter.Value)
	}
	if got.Parts[1].Limit != -1 {
		t.Errorf("the source keeps its own limit in the detail: %v, want -1", got.Parts[1].Limit)
	}
}

// TestCombine_OnlyTheGrantedSources: the sources it is handed are what is
// summed, a source the instance is not granted is not among them, and counts
// for nothing.
func TestCombine_OnlyTheGrantedSources(t *testing.T) {
	got, ok := Combine([]CombinedSource{{Slug: "b-source", Weight: weight(t, "0.6"), Counter: Counter{Value: 100}, Threshold: 1000}})
	if !ok {
		t.Fatal("Combine() found nothing granted")
	}
	if got.Counter.Value != 60 || got.Threshold != 600 || len(got.Parts) != 1 {
		t.Errorf("one granted source reads %v of %v with %d part(s), want 60 of 600 with 1", got.Counter.Value, got.Threshold, len(got.Parts))
	}
}

func TestCombine_NothingGranted(t *testing.T) {
	for _, sources := range [][]CombinedSource{nil, {}} {
		if got, ok := Combine(sources); ok {
			t.Errorf("Combine(%v) = %+v, want nothing: a combined entitlement exists once one of its sources is granted", sources, got)
		}
	}
}

func TestCombine_WindowAndEventCount(t *testing.T) {
	day := func(d int) *time.Time {
		v := time.Date(2026, 11, d, 0, 0, 0, 0, time.UTC)
		return &v
	}

	t.Run("lifetime sources are a lifetime window", func(t *testing.T) {
		got, _ := Combine([]CombinedSource{
			{Slug: "a-source", Weight: weight(t, "1"), Counter: Counter{Value: 1, EventCount: 4}, Threshold: 1},
			{Slug: "b-source", Weight: weight(t, "1"), Counter: Counter{Value: 1, EventCount: 6}, Threshold: 1},
		})
		if got.Window.Start != nil || got.Window.End != nil {
			t.Errorf("Window = %+v, want the lifetime one", got.Window)
		}
		if got.Counter.EventCount != 10 {
			t.Errorf("EventCount = %d, want the sum of theirs, 10", got.Counter.EventCount)
		}
	})

	t.Run("the window the sources share", func(t *testing.T) {
		window := Window{Start: day(1), End: day(30)}
		got, _ := Combine([]CombinedSource{
			{Slug: "a-source", Weight: weight(t, "1"), Threshold: 1, Window: window},
			{Slug: "b-source", Weight: weight(t, "1"), Threshold: 1, Window: window},
		})
		if got.Window != window {
			t.Errorf("Window = %+v, want %+v", got.Window, window)
		}
	})

	t.Run("the one that started last is the open one", func(t *testing.T) {
		later := Window{Start: day(10), End: day(20)}
		got, _ := Combine([]CombinedSource{
			{Slug: "a-source", Weight: weight(t, "1"), Threshold: 1, Window: Window{Start: day(1), End: day(10)}},
			{Slug: "b-source", Weight: weight(t, "1"), Threshold: 1, Window: later},
			{Slug: "c-source", Weight: weight(t, "1"), Threshold: 1, Window: Window{Start: day(1), End: day(10)}},
		})
		if got.Window != later {
			t.Errorf("Window = %+v, want %+v", got.Window, later)
		}
	})

	t.Run("the event count does not wrap", func(t *testing.T) {
		got, _ := Combine([]CombinedSource{
			{Slug: "a-source", Weight: weight(t, "1"), Counter: Counter{EventCount: math.MaxInt32}, Threshold: 1},
			{Slug: "b-source", Weight: weight(t, "1"), Counter: Counter{EventCount: math.MaxInt32}, Threshold: 1},
		})
		if got.Counter.EventCount != math.MaxInt32 {
			t.Errorf("EventCount = %d, want it capped at %d", got.Counter.EventCount, math.MaxInt32)
		}
	})
}

func TestCombineLimits(t *testing.T) {
	limit, unlimited := CombineLimits([]WeightedLimit{{Weight: weight(t, "0.4"), Threshold: 1000}, {Weight: weight(t, "0.6"), Threshold: 1000}})
	if unlimited || !limit.Equal(decimal.NewFromInt(1000)) {
		t.Errorf("CombineLimits() = %v, %v, want 1000, false", limit, unlimited)
	}

	limit, unlimited = CombineLimits([]WeightedLimit{{Weight: weight(t, "0.4"), Threshold: 1000}, {Weight: weight(t, "2"), Threshold: -1}})
	if !unlimited || !limit.Equal(decimal.NewFromInt(-1)) {
		t.Errorf("CombineLimits() with an unlimited source = %v, %v, want -1, true", limit, unlimited)
	}

	// A limit of 0 is a limit: a hard zero, not an absence of one.
	limit, unlimited = CombineLimits([]WeightedLimit{{Weight: weight(t, "1"), Threshold: 0}, {Weight: weight(t, "1"), Threshold: 0}})
	if unlimited || !limit.IsZero() {
		t.Errorf("CombineLimits() of zeros = %v, %v, want 0, false", limit, unlimited)
	}
}
