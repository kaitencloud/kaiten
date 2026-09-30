package reportentitlementusagemetric

import (
	"testing"

	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
)

// TestComputeUpdatedUsage_SetSeedsOneEvent pins the event count a `set`
// leaves behind, and the reason it is 1 rather than 0: a set is itself one
// reported observation, and AVERAGE's next append folds on that count.
// Seeding 0 would make the value just set disappear from the average, and
// would store the incoherent pair {value, 0 events}.
func TestComputeUpdatedUsage_SetSeedsOneEvent(t *testing.T) {
	set, err := computeUpdatedUsage(
		&Command{Behavior: BehaviorSet, Value: 60},
		entitlementvalue.NewDefaultNumberUsageValue(),
		"AVERAGE",
	)
	if err != nil {
		t.Fatalf("computeUpdatedUsage(set) returned unexpected error: %v", err)
	}
	if set.Value != 60 {
		t.Errorf("set value = %v, want 60", set.Value)
	}
	if set.EventCount != 1 {
		t.Fatalf("set event count = %d, want 1 -- a set is one observation", set.EventCount)
	}

	appended, err := computeUpdatedUsage(&Command{Behavior: BehaviorAppend, Value: 40}, set, "AVERAGE")
	if err != nil {
		t.Fatalf("computeUpdatedUsage(append) returned unexpected error: %v", err)
	}
	if appended.Value != 50 {
		t.Errorf("average after set(60) then append(40) = %v, want 50 (with event count 0 it would be 40)", appended.Value)
	}
	if appended.EventCount != 2 {
		t.Errorf("event count after set then append = %d, want 2", appended.EventCount)
	}
}

// TestComputeUpdatedUsage_SetWritesTheAbsoluteValue is the refutation of the
// "set cannot correct a counter downward" claim: set does not fold against
// the stored value, it replaces it, so a correction lands wherever the
// caller asked. Whether the result is then accepted is a separate cap
// comparison in Execute -- and 25 is below a cap of 30, so it is.
func TestComputeUpdatedUsage_SetWritesTheAbsoluteValue(t *testing.T) {
	overCap := &entitlementvalue.NumberUsageValue{Type: entitlementvalue.TypeNumber, Value: 60, EventCount: 12}

	corrected, err := computeUpdatedUsage(&Command{Behavior: BehaviorSet, Value: 25}, overCap, "SUM")
	if err != nil {
		t.Fatalf("computeUpdatedUsage(set) returned unexpected error: %v", err)
	}
	if corrected.Value != 25 {
		t.Errorf("set value = %v, want 25 -- set replaces the stored value, it does not fold into it", corrected.Value)
	}
}

func TestComputeUpdatedUsage_UnknownBehaviorIsRejected(t *testing.T) {
	if _, err := computeUpdatedUsage(
		&Command{Behavior: "increment", Value: 1},
		entitlementvalue.NewDefaultNumberUsageValue(),
		"SUM",
	); err == nil {
		t.Fatal("expected a validation error for an unsupported behavior")
	}
}
