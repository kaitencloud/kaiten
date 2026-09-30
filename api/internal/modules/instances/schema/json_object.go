package schema

import "encoding/json"

// NormalizeJSONObject ensures object-shaped fields are always exposed as objects.
func NormalizeJSONObject(value map[string]any) map[string]any {
	if value == nil {
		return map[string]any{}
	}

	return value
}

// MarshalJSONObject serializes object-shaped fields while normalizing nil maps.
func MarshalJSONObject(value map[string]any) ([]byte, error) {
	return json.Marshal(NormalizeJSONObject(value))
}

// UnmarshalJSONObject deserializes object-shaped JSON and normalizes null/empty values.
func UnmarshalJSONObject(data []byte) (map[string]any, error) {
	if len(data) == 0 || string(data) == "null" {
		return map[string]any{}, nil
	}

	var value map[string]any
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, err
	}

	return NormalizeJSONObject(value), nil
}
