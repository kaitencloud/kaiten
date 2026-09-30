package value

import "testing"

func TestIsUnlimitedThreshold(t *testing.T) {
	cases := []struct {
		name      string
		threshold float64
		want      bool
	}{
		{"sentinel", -1, true},
		{"zero", 0, false},
		{"positive", 120, false},
		// Only the exact sentinel disables the cap — the reporter enforces
		// every other negative value, so unlimited must NOT match them.
		{"other negative", -5, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsUnlimitedThreshold(tc.threshold); got != tc.want {
				t.Errorf("IsUnlimitedThreshold(%v) = %v, want %v", tc.threshold, got, tc.want)
			}
		})
	}
}

func TestIsUnlimitedValue(t *testing.T) {
	cases := []struct {
		name  string
		value map[string]any
		want  bool
	}{
		{"unlimited number", map[string]any{"type": "number", "value": float64(-1)}, true},
		{"unlimited int", map[string]any{"type": "number", "value": -1}, true},
		{"capped number", map[string]any{"type": "number", "value": float64(120)}, false},
		{"other negative", map[string]any{"type": "number", "value": float64(-5)}, false},
		{"boolean", map[string]any{"type": "boolean", "value": true}, false},
		{"object", map[string]any{"type": "object", "value": map[string]any{}}, false},
		{"missing type", map[string]any{"value": float64(-1)}, false},
		{"non-numeric value", map[string]any{"type": "number", "value": "unlimited"}, false},
		{"nil map", nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsUnlimitedValue(tc.value); got != tc.want {
				t.Errorf("IsUnlimitedValue(%v) = %v, want %v", tc.value, got, tc.want)
			}
		})
	}
}
