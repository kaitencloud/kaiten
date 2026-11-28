package schema

import (
	"encoding/json"
	"math"
	"testing"
)

func TestNewUsageResources(t *testing.T) {
	tests := []struct {
		name            string
		count, atLimit  int64
		stale           bool
		wantCount, want int32
	}{
		{"nothing", 0, 0, false, 0, 0},
		{"some at their limit", 6, 2, false, 6, 2},
		{"all at their limit", 3, 3, false, 3, 3},
		{"a closed window leaves none at its limit", 6, 2, true, 6, 0},
		{"clamped, never wrapped", math.MaxInt64, math.MaxInt64, false, math.MaxInt32, math.MaxInt32},
		{"never negative", -1, -1, false, 0, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NewUsageResources(tt.count, tt.atLimit, tt.stale)
			if got.Count != tt.wantCount || got.AtLimit != tt.want {
				t.Errorf("NewUsageResources(%d, %d, %v) = %+v, want {%d %d}", tt.count, tt.atLimit, tt.stale, got, tt.wantCount, tt.want)
			}
		})
	}
}

// An entitlement's usage that counts per instance reads as it always did: the
// two members that belong to a resource are absent, not null.
func TestEntitlementUsageOmitsWhatIsNotAResource(t *testing.T) {
	raw, err := json.Marshal(EntitlementUsage{})
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"resourceKey", "resources"} {
		if _, present := decoded[name]; present {
			t.Errorf("%s is on the wire of an entitlement that counts per instance: %s", name, raw)
		}
	}

	key := "stigg"
	raw, err = json.Marshal(EntitlementUsage{ResourceKey: &key, Resources: NewUsageResources(6, 2, false)})
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["resourceKey"] != "stigg" {
		t.Errorf("resourceKey = %v: %s", decoded["resourceKey"], raw)
	}
	if resources, _ := decoded["resources"].(map[string]any); resources["count"] != float64(6) || resources["atLimit"] != float64(2) {
		t.Errorf("resources = %v: %s", decoded["resources"], raw)
	}
}
