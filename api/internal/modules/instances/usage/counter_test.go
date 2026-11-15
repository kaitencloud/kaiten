package usage

import (
	"errors"
	"testing"
)

func TestFold(t *testing.T) {
	stored := Counter{Value: 10, EventCount: 2}
	tests := []struct {
		aggregation string
		behavior    Behavior
		want        Counter
	}{
		{"COUNT", Append, Counter{11, 3}},
		{"SUM", Append, Counter{14, 3}},
		{"AVERAGE", Append, Counter{8, 3}},
		{"MAX", Append, Counter{10, 3}},
		{"MIN", Append, Counter{4, 3}},
		{"LATEST", Append, Counter{4, 3}},
		{"COUNT", Set, Counter{4, 1}},
		{"SUM", Set, Counter{4, 1}},
		{"AVERAGE", Set, Counter{4, 1}},
		{"MAX", Set, Counter{4, 1}},
		{"MIN", Set, Counter{4, 1}},
		{"LATEST", Set, Counter{4, 1}},
	}
	for _, tt := range tests {
		t.Run(tt.aggregation+"_"+string(tt.behavior), func(t *testing.T) {
			got, err := Fold(stored, 4, tt.behavior, tt.aggregation)
			if err != nil {
				t.Fatalf("Fold() error = %v", err)
			}
			if got != tt.want {
				t.Errorf("Fold() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

// TestFold_SetSeedsOneEvent pins the event count a set leaves behind, and
// the reason it is 1 rather than 0: AVERAGE's next append folds on it.
func TestFold_SetSeedsOneEvent(t *testing.T) {
	set, err := Fold(Zero(), 60, Set, "AVERAGE")
	if err != nil {
		t.Fatal(err)
	}
	appended, err := Fold(set, 40, Append, "AVERAGE")
	if err != nil {
		t.Fatal(err)
	}
	if appended.Value != 50 || appended.EventCount != 2 {
		t.Errorf("set(60) then append(40) = %+v, want {50 2} (with event count 0 it would be 40)", appended)
	}
}

// TestFold_SetWritesTheAbsoluteValue: a set replaces the stored value, it
// does not fold into it, so a correction lands wherever the caller asked.
func TestFold_SetWritesTheAbsoluteValue(t *testing.T) {
	got, err := Fold(Counter{Value: 60, EventCount: 12}, 25, Set, "SUM")
	if err != nil {
		t.Fatal(err)
	}
	if got.Value != 25 {
		t.Errorf("set value = %v, want 25", got.Value)
	}
}

func TestFold_Refusals(t *testing.T) {
	if _, err := Fold(Zero(), 1, "increment", "SUM"); !errors.Is(err, ErrUnknownBehavior) {
		t.Errorf("unknown behavior: err = %v, want ErrUnknownBehavior", err)
	}
	if _, err := Fold(Zero(), 1, Append, "BOGUS"); !errors.Is(err, ErrInvalidAggregation) {
		t.Errorf("unknown aggregation: err = %v, want ErrInvalidAggregation", err)
	}
	if _, err := Fold(Zero(), 1, Set, "BOGUS"); err != nil {
		t.Errorf("a set never reads the aggregation: err = %v", err)
	}
}
