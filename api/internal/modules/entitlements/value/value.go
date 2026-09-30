package value

import (
	"encoding/json"
	"fmt"
	"math"

	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

const (
	TypeNumber  = "number"
	TypeBoolean = "boolean"
	TypeObject  = "object"

	// UnlimitedThreshold is the sentinel value stored in a license entitlement to signal
	// that no usage cap applies. The reporter treats any threshold equal to this value as
	// "no limit enforced".
	UnlimitedThreshold = float64(-1)
)

type EntitlementJSONValue struct {
	Type  string `json:"type"`
	Value any    `json:"value"`
}

type NumberUsageValue struct {
	Type       string  `json:"type"`
	Value      float64 `json:"value"`
	EventCount int32   `json:"event_count"`
}

func NormalizeLicenseValue(entitlementType entitlementschema.Type, raw map[string]any) (*EntitlementJSONValue, error) {
	if raw == nil {
		return nil, fmt.Errorf("value is required")
	}

	rawType, ok := raw["type"].(string)
	if !ok || rawType == "" {
		return nil, fmt.Errorf("value.type is required")
	}

	switch entitlementType {
	case entitlementschema.Number, entitlementschema.NumberAICredit:
		if rawType != TypeNumber {
			return nil, fmt.Errorf("value.type must be %q for %s entitlements", TypeNumber, entitlementType)
		}
		number, ok := toFloat(raw["value"])
		if !ok {
			return nil, fmt.Errorf("value.value must be a number for NUMBER entitlements")
		}
		return &EntitlementJSONValue{
			Type:  TypeNumber,
			Value: number,
		}, nil
	case entitlementschema.Boolean:
		if rawType != TypeBoolean {
			return nil, fmt.Errorf("value.type must be %q for BOOLEAN entitlements", TypeBoolean)
		}
		booleanValue, ok := raw["value"].(bool)
		if !ok {
			return nil, fmt.Errorf("value.value must be a boolean for BOOLEAN entitlements")
		}
		return &EntitlementJSONValue{
			Type:  TypeBoolean,
			Value: booleanValue,
		}, nil
	case entitlementschema.Config:
		if rawType != TypeObject {
			return nil, fmt.Errorf("value.type must be %q for CONFIG entitlements", TypeObject)
		}
		objectValue, ok := raw["value"].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("value.value must be an object for CONFIG entitlements")
		}
		return &EntitlementJSONValue{
			Type:  TypeObject,
			Value: objectValue,
		}, nil
	default:
		return nil, fmt.Errorf("unsupported entitlement type %q", entitlementType)
	}
}

func ParseLicenseValue(raw []byte) (*EntitlementJSONValue, error) {
	var parsed EntitlementJSONValue
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse entitlement value: %w", err)
	}
	if parsed.Type == "" {
		return nil, fmt.Errorf("entitlement value type is required")
	}
	return &parsed, nil
}

func ParseNumberThreshold(raw []byte) (float64, error) {
	parsed, err := ParseLicenseValue(raw)
	if err != nil {
		return 0, err
	}
	if parsed.Type != TypeNumber {
		return 0, fmt.Errorf("entitlement value type %q is not supported for usage thresholds", parsed.Type)
	}
	number, ok := toFloat(parsed.Value)
	if !ok {
		return 0, fmt.Errorf("entitlement numeric value is invalid")
	}
	return number, nil
}

func ParseNumberUsageValue(raw []byte) (*NumberUsageValue, error) {
	var parsed NumberUsageValue
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse number usage value: %w", err)
	}
	if parsed.Type != TypeNumber {
		return nil, fmt.Errorf("usage value type must be %q", TypeNumber)
	}
	if parsed.EventCount < 0 {
		return nil, fmt.Errorf("usage event_count must be non-negative")
	}
	return &parsed, nil
}

func NewDefaultNumberUsageValue() *NumberUsageValue {
	return &NumberUsageValue{
		Type:       TypeNumber,
		Value:      0,
		EventCount: 0,
	}
}

func ToBytes(v any) ([]byte, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal value: %w", err)
	}
	return data, nil
}

func ToMap(raw []byte) (map[string]any, error) {
	var parsed map[string]any
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse JSON value: %w", err)
	}
	return parsed, nil
}

// IsUnlimitedThreshold reports whether a NUMBER threshold carries the unlimited
// sentinel. Only the exact sentinel disables the cap — the reporter enforces
// any other value.
func IsUnlimitedThreshold(threshold float64) bool {
	return threshold == UnlimitedThreshold
}

// IsUnlimitedValue reports whether a license entitlement value map (as produced
// by ToMap) carries the unlimited sentinel, with the same semantics as the
// usage reporter's enforcement check.
func IsUnlimitedValue(value map[string]any) bool {
	if t, _ := value["type"].(string); t != TypeNumber {
		return false
	}
	number, ok := toFloat(value["value"])
	return ok && IsUnlimitedThreshold(number)
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		f, err := n.Float64()
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

func IsWholeNumber(v float64) bool {
	return math.Trunc(v) == v
}
