package validator

import (
	"encoding/json"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
)

// BuildResourceSchema composes a single JSON Schema 2020-12 object schema
// from the active MetadataField rows of a resource type.
//
// Each field's stored json_schema (already valid JSON Schema 2020-12 thanks
// to ValidateSchemaShape on POST/PATCH) is plugged in as-is under its key
// inside "properties". No DSL translation happens here.
//
// The caller-supplied strict/tolerant flag controls additionalProperties:
//
//   - strict   → additionalProperties: false
//     unknown keys in the payload are rejected.
//   - tolerant → additionalProperties: true
//     unknown keys are accepted unchanged (preserves forward-compat for
//     auto-reported metadata).
//
// Returns the marshaled schema as a []byte ready to feed to ValidateMetadata.
func BuildResourceSchema(fields []db.MetadataField, isStrict bool) ([]byte, error) {
	properties := make(map[string]any, len(fields))
	for _, f := range fields {
		if len(f.JsonSchema) == 0 {
			return nil, fmt.Errorf("metadata field %q has empty json_schema in db (corrupted row?)", f.Key)
		}
		var schema map[string]any
		if err := json.Unmarshal(f.JsonSchema, &schema); err != nil {
			return nil, fmt.Errorf("metadata field %q: invalid stored json_schema: %w", f.Key, err)
		}
		properties[f.Key] = schema
	}

	composed := map[string]any{
		"$schema":              "https://json-schema.org/draft/2020-12/schema",
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": !isStrict, // strict ⇒ false, tolerant ⇒ true
	}

	out, err := json.Marshal(composed)
	if err != nil {
		return nil, fmt.Errorf("composing resource schema: %w", err)
	}
	return out, nil
}
