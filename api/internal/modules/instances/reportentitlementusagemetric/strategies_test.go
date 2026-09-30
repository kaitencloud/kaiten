package reportentitlementusagemetric

import "testing"

func TestSelectAppendStrategy_UnsupportedMethod_ReturnsError(t *testing.T) {
	if _, err := SelectAppendStrategy("BOGUS"); err == nil {
		t.Fatal("expected an error for an unsupported aggregation method")
	}
}

func TestAppendStrategy_Apply(t *testing.T) {
	tests := []struct {
		name              string
		aggregationMethod string
		storedValue       float64
		newValue          float64
		eventCount        int32
		want              float64
	}{
		{"Count ignores newValue and increments", "COUNT", 3, 100, 3, 4},
		{"Sum adds newValue to storedValue", "SUM", 3, 4, 3, 7},
		{"Average folds newValue into the running mean", "AVERAGE", 10, 20, 3, 12.5},
		{"Max keeps storedValue when newValue is smaller", "MAX", 10, 4, 0, 10},
		{"Max adopts newValue when larger", "MAX", 10, 40, 0, 40},
		{"Min keeps storedValue when newValue is larger", "MIN", 10, 40, 0, 10},
		{"Min adopts newValue when smaller", "MIN", 10, 4, 0, 4},
		{"Latest always overwrites with newValue", "LATEST", 10, 4, 0, 4},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			strategy, err := SelectAppendStrategy(tt.aggregationMethod)
			if err != nil {
				t.Fatalf("SelectAppendStrategy(%q) returned unexpected error: %v", tt.aggregationMethod, err)
			}

			got := strategy.Apply(tt.storedValue, tt.newValue, tt.eventCount)
			if got != tt.want {
				t.Errorf("Apply(%v, %v, %v) = %v, want %v", tt.storedValue, tt.newValue, tt.eventCount, got, tt.want)
			}
		})
	}
}

// TestAppendStrategy_SumMatchesLegacyCalculatedUsageBehavior pins the fact
// this refactor relies on: SUM is byte-for-byte identical to the old
// CALCULATED_USAGE-only append strategy, so making SUM the default for
// CALCULATED_USAGE preserves existing behavior exactly.
func TestAppendStrategy_SumMatchesLegacyCalculatedUsageBehavior(t *testing.T) {
	strategy, err := SelectAppendStrategy("SUM")
	if err != nil {
		t.Fatalf("SelectAppendStrategy(SUM) returned unexpected error: %v", err)
	}

	got := strategy.Apply(12.5, 7.5, 9)
	if want := 20.0; got != want {
		t.Errorf("SUM.Apply(12.5, 7.5, 9) = %v, want %v", got, want)
	}
}
