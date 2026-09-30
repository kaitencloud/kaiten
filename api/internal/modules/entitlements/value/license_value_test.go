package value

import (
	"encoding/json"
	"strings"
	"testing"

	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

// TestNormalizeLicenseValue locks in the type-dispatch business rule that
// governs how a raw JSON value attached to a license entitlement is
// validated: the declared entitlement Type must agree with the value's own
// "type" tag, and the "value" payload must have the shape that tag implies.
func TestNormalizeLicenseValue(t *testing.T) {
	tests := []struct {
		name            string
		entitlementType entitlementschema.Type
		raw             map[string]any
		wantErr         string // substring expected in the error, "" means no error
		wantType        string
		wantValue       any
	}{
		{
			name:    "nil raw value is rejected",
			raw:     nil,
			wantErr: "value is required",
		},
		{
			name:            "missing type field is rejected",
			entitlementType: entitlementschema.Number,
			raw:             map[string]any{"value": float64(5)},
			wantErr:         "value.type is required",
		},
		{
			name:            "empty type field is rejected",
			entitlementType: entitlementschema.Number,
			raw:             map[string]any{"type": "", "value": float64(5)},
			wantErr:         "value.type is required",
		},
		{
			name:            "non-string type field is rejected",
			entitlementType: entitlementschema.Number,
			raw:             map[string]any{"type": 5, "value": float64(5)},
			wantErr:         "value.type is required",
		},
		{
			name:            "number entitlement with matching type and float value",
			entitlementType: entitlementschema.Number,
			raw:             map[string]any{"type": "number", "value": float64(42)},
			wantType:        TypeNumber,
			wantValue:       float64(42),
		},
		{
			name:            "number entitlement accepts a plain int value, not just float64",
			entitlementType: entitlementschema.Number,
			raw:             map[string]any{"type": "number", "value": 42},
			wantType:        TypeNumber,
			wantValue:       float64(42),
		},
		{
			name:            "number entitlement accepts a json.Number value (decoder with UseNumber)",
			entitlementType: entitlementschema.Number,
			raw:             map[string]any{"type": "number", "value": json.Number("42")},
			wantType:        TypeNumber,
			wantValue:       float64(42),
		},
		{
			name:            "number entitlement rejects mismatched type tag",
			entitlementType: entitlementschema.Number,
			raw:             map[string]any{"type": "boolean", "value": true},
			wantErr:         `value.type must be "number"`,
		},
		{
			name:            "number entitlement rejects non-numeric value",
			entitlementType: entitlementschema.Number,
			raw:             map[string]any{"type": "number", "value": "not-a-number"},
			wantErr:         "value.value must be a number",
		},
		{
			name:            "number entitlement accepts the unlimited sentinel",
			entitlementType: entitlementschema.Number,
			raw:             map[string]any{"type": "number", "value": float64(-1)},
			wantType:        TypeNumber,
			wantValue:       float64(-1),
		},
		{
			name:            "boolean entitlement with matching type and true value",
			entitlementType: entitlementschema.Boolean,
			raw:             map[string]any{"type": "boolean", "value": true},
			wantType:        TypeBoolean,
			wantValue:       true,
		},
		{
			name:            "boolean entitlement with matching type and false value",
			entitlementType: entitlementschema.Boolean,
			raw:             map[string]any{"type": "boolean", "value": false},
			wantType:        TypeBoolean,
			wantValue:       false,
		},
		{
			name:            "boolean entitlement rejects mismatched type tag",
			entitlementType: entitlementschema.Boolean,
			raw:             map[string]any{"type": "number", "value": float64(1)},
			wantErr:         `value.type must be "boolean"`,
		},
		{
			name:            "boolean entitlement rejects non-boolean value",
			entitlementType: entitlementschema.Boolean,
			raw:             map[string]any{"type": "boolean", "value": "true"},
			wantErr:         "value.value must be a boolean",
		},
		{
			name:            "config entitlement with matching type and object value",
			entitlementType: entitlementschema.Config,
			raw:             map[string]any{"type": "object", "value": map[string]any{"key": "value"}},
			wantType:        TypeObject,
			wantValue:       map[string]any{"key": "value"},
		},
		{
			name:            "config entitlement rejects mismatched type tag",
			entitlementType: entitlementschema.Config,
			raw:             map[string]any{"type": "number", "value": float64(1)},
			wantErr:         `value.type must be "object"`,
		},
		{
			name:            "config entitlement rejects non-object value",
			entitlementType: entitlementschema.Config,
			raw:             map[string]any{"type": "object", "value": "not-an-object"},
			wantErr:         "value.value must be an object",
		},
		{
			name:            "unsupported entitlement type is rejected",
			entitlementType: entitlementschema.Type("UNKNOWN"),
			raw:             map[string]any{"type": "number", "value": float64(1)},
			wantErr:         `unsupported entitlement type "UNKNOWN"`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := NormalizeLicenseValue(tt.entitlementType, tt.raw)

			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("NormalizeLicenseValue() error = nil, want error containing %q", tt.wantErr)
				}
				if !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("NormalizeLicenseValue() error = %q, want it to contain %q", err.Error(), tt.wantErr)
				}
				if got != nil {
					t.Errorf("NormalizeLicenseValue() = %+v, want nil on error", got)
				}
				return
			}

			if err != nil {
				t.Fatalf("NormalizeLicenseValue() unexpected error: %v", err)
			}
			if got == nil {
				t.Fatal("NormalizeLicenseValue() = nil, want a value")
			}
			if got.Type != tt.wantType {
				t.Errorf("NormalizeLicenseValue().Type = %q, want %q", got.Type, tt.wantType)
			}

			switch want := tt.wantValue.(type) {
			case map[string]any:
				gotMap, ok := got.Value.(map[string]any)
				if !ok {
					t.Fatalf("NormalizeLicenseValue().Value = %#v (%T), want map[string]any", got.Value, got.Value)
				}
				if len(gotMap) != len(want) {
					t.Errorf("NormalizeLicenseValue().Value = %#v, want %#v", gotMap, want)
				}
				for k, v := range want {
					if gotMap[k] != v {
						t.Errorf("NormalizeLicenseValue().Value[%q] = %#v, want %#v", k, gotMap[k], v)
					}
				}
			default:
				if got.Value != tt.wantValue {
					t.Errorf("NormalizeLicenseValue().Value = %#v, want %#v", got.Value, tt.wantValue)
				}
			}
		})
	}
}

func TestParseLicenseValue(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		wantErr string
		wantVal *EntitlementJSONValue
	}{
		{
			name:    "valid number value parses",
			raw:     `{"type":"number","value":10}`,
			wantVal: &EntitlementJSONValue{Type: TypeNumber, Value: float64(10)},
		},
		{
			name:    "malformed JSON is rejected",
			raw:     `{not-json`,
			wantErr: "failed to parse entitlement value",
		},
		{
			name:    "missing type field is rejected",
			raw:     `{"value":10}`,
			wantErr: "entitlement value type is required",
		},
		{
			name:    "empty type field is rejected",
			raw:     `{"type":"","value":10}`,
			wantErr: "entitlement value type is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseLicenseValue([]byte(tt.raw))

			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("ParseLicenseValue(%q) error = %v, want it to contain %q", tt.raw, err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseLicenseValue(%q) unexpected error: %v", tt.raw, err)
			}
			if got.Type != tt.wantVal.Type || got.Value != tt.wantVal.Value {
				t.Errorf("ParseLicenseValue(%q) = %+v, want %+v", tt.raw, got, tt.wantVal)
			}
		})
	}
}

func TestParseNumberThreshold(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    float64
		wantErr string
	}{
		{name: "positive number", raw: `{"type":"number","value":100}`, want: 100},
		{name: "unlimited sentinel", raw: `{"type":"number","value":-1}`, want: -1},
		{name: "zero", raw: `{"type":"number","value":0}`, want: 0},
		{
			name:    "boolean type is rejected for thresholds",
			raw:     `{"type":"boolean","value":true}`,
			wantErr: "not supported for usage thresholds",
		},
		{
			name:    "object type is rejected for thresholds",
			raw:     `{"type":"object","value":{}}`,
			wantErr: "not supported for usage thresholds",
		},
		{
			name:    "malformed JSON propagates the parse error",
			raw:     `not-json`,
			wantErr: "failed to parse entitlement value",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseNumberThreshold([]byte(tt.raw))

			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("ParseNumberThreshold(%q) error = %v, want it to contain %q", tt.raw, err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseNumberThreshold(%q) unexpected error: %v", tt.raw, err)
			}
			if got != tt.want {
				t.Errorf("ParseNumberThreshold(%q) = %v, want %v", tt.raw, got, tt.want)
			}
		})
	}
}

func TestParseNumberUsageValue(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		wantErr string
		want    *NumberUsageValue
	}{
		{
			name: "valid usage value",
			raw:  `{"type":"number","value":5,"event_count":3}`,
			want: &NumberUsageValue{Type: TypeNumber, Value: 5, EventCount: 3},
		},
		{
			name:    "wrong type is rejected",
			raw:     `{"type":"boolean","value":0,"event_count":1}`,
			wantErr: `usage value type must be "number"`,
		},
		{
			name:    "negative event count is rejected",
			raw:     `{"type":"number","value":5,"event_count":-1}`,
			wantErr: "event_count must be non-negative",
		},
		{
			name:    "malformed JSON is rejected",
			raw:     `not-json`,
			wantErr: "failed to parse number usage value",
		},
		{
			name: "zero event count is valid",
			raw:  `{"type":"number","value":0,"event_count":0}`,
			want: &NumberUsageValue{Type: TypeNumber, Value: 0, EventCount: 0},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParseNumberUsageValue([]byte(tt.raw))

			if tt.wantErr != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
					t.Fatalf("ParseNumberUsageValue(%q) error = %v, want it to contain %q", tt.raw, err, tt.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("ParseNumberUsageValue(%q) unexpected error: %v", tt.raw, err)
			}
			if *got != *tt.want {
				t.Errorf("ParseNumberUsageValue(%q) = %+v, want %+v", tt.raw, got, tt.want)
			}
		})
	}
}

func TestNewDefaultNumberUsageValue(t *testing.T) {
	got := NewDefaultNumberUsageValue()
	want := &NumberUsageValue{Type: TypeNumber, Value: 0, EventCount: 0}
	if *got != *want {
		t.Errorf("NewDefaultNumberUsageValue() = %+v, want %+v", got, want)
	}
}

func TestToBytesAndToMap(t *testing.T) {
	t.Run("round-trips a map through ToBytes/ToMap", func(t *testing.T) {
		in := map[string]any{"a": float64(1), "b": "two"}
		raw, err := ToBytes(in)
		if err != nil {
			t.Fatalf("ToBytes() unexpected error: %v", err)
		}

		got, err := ToMap(raw)
		if err != nil {
			t.Fatalf("ToMap() unexpected error: %v", err)
		}
		if len(got) != len(in) {
			t.Fatalf("ToMap() = %#v, want %#v", got, in)
		}
		for k, v := range in {
			if got[k] != v {
				t.Errorf("ToMap()[%q] = %#v, want %#v", k, got[k], v)
			}
		}
	})

	t.Run("ToBytes rejects unmarshalable values", func(t *testing.T) {
		_, err := ToBytes(make(chan int))
		if err == nil {
			t.Fatal("ToBytes() error = nil, want error for unmarshalable value")
		}
		if !strings.Contains(err.Error(), "failed to marshal value") {
			t.Errorf("ToBytes() error = %v, want it to mention marshal failure", err)
		}
	})

	t.Run("ToMap rejects malformed JSON", func(t *testing.T) {
		_, err := ToMap([]byte("not-json"))
		if err == nil {
			t.Fatal("ToMap() error = nil, want error for malformed JSON")
		}
		if !strings.Contains(err.Error(), "failed to parse JSON value") {
			t.Errorf("ToMap() error = %v, want it to mention parse failure", err)
		}
	})
}

func TestIsWholeNumber(t *testing.T) {
	tests := []struct {
		name string
		in   float64
		want bool
	}{
		{name: "zero is whole", in: 0, want: true},
		{name: "positive integer is whole", in: 42, want: true},
		{name: "negative integer is whole", in: -1, want: true},
		{name: "positive fraction is not whole", in: 4.5, want: false},
		{name: "negative fraction is not whole", in: -0.25, want: false},
		{name: "very small fraction is not whole", in: 1.0000001, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsWholeNumber(tt.in); got != tt.want {
				t.Errorf("IsWholeNumber(%v) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}
