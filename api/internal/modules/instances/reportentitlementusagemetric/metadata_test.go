package reportentitlementusagemetric

import (
	"strings"
	"testing"
)

func TestEncodeMetadata(t *testing.T) {
	cases := []struct {
		name        string
		metadata    map[string]any
		want        string
		wantDropped bool
	}{
		{"absent", nil, "", false},
		{"empty object", map[string]any{}, "", false},
		{"keys are sorted, the encoding compact", map[string]any{"model": "gpt-x", "a": true}, `{"a":true,"model":"gpt-x"}`, false},
		{"numbers in plain notation", map[string]any{"big": 1e21, "small": 1.5e-7, "n": float64(42)}, `{"big":1000000000000000000000,"n":42,"small":0.00000015}`, false},
		{"nested values too", map[string]any{"a": []any{1e21, map[string]any{"b": 2.5}}}, `{"a":[1000000000000000000000,{"b":2.5}]}`, false},
		{"exactly 4 KiB is stored", map[string]any{"k": strings.Repeat("a", 4096-8)}, `{"k":"` + strings.Repeat("a", 4096-8) + `"}`, false},
		{"one byte more is dropped", map[string]any{"k": strings.Repeat("a", 4096-7)}, "", true},
		{"size counts UTF-8 bytes", map[string]any{"k": strings.Repeat("é", 2045)}, "", true},
		{"size counts HTML escapes", map[string]any{"k": strings.Repeat("<", 682)}, "", true},
		{"a plain number counts its digits", map[string]any{"n": 1e300, "k": strings.Repeat("a", 3800)}, "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, dropped, err := encodeMetadata(tc.metadata)
			if err != nil {
				t.Fatalf("encodeMetadata() error = %v", err)
			}
			if string(got) != tc.want {
				t.Errorf("encodeMetadata() = %.80q…, want %.80q…", got, tc.want)
			}
			if dropped != tc.wantDropped {
				t.Errorf("dropped = %v, want %v", dropped, tc.wantDropped)
			}
		})
	}
}
