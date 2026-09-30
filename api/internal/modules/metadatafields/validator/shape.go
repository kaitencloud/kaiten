package validator

import (
	"bytes"
	"encoding/json"
	"fmt"

	"github.com/santhosh-tekuri/jsonschema/v6"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// ValidateSchemaShape verifies that the supplied bytes are themselves a
// syntactically valid JSON Schema 2020-12 document.
//
// This is the first gate of a MetadataField POST/PATCH: rejecting malformed
// schemas at write time prevents corrupted rows from sitting in the DB and
// blowing up later, at metadata-validation time, in a much more confusing
// way.
//
// Returns a kaitenerrors.UnprocessableEntity (HTTP 422) error if the schema
// is malformed; the underlying compiler error is preserved in the message so
// admins get a precise hint ("expected array for enum", etc.).
func ValidateSchemaShape(jsonSchema []byte) error {
	if len(jsonSchema) == 0 {
		return kaitenerrors.UnprocessableEntity(
			"MetadataField.SchemaShape.Empty",
			"json_schema must not be empty",
		)
	}

	// newConfiguredCompiler pins Draft 2020-12 and enables format assertion
	// (see validate.go) — admins expect format: "date" to mean something at
	// validation time, and v6 leaves format assertion off by default for 2020-12.
	c := newConfiguredCompiler()

	const resourceID = "metadata_field_schema.json"
	// v6's AddResource takes an already-decoded JSON value (not an io.Reader),
	// so the "is this even JSON?" check moves up here to UnmarshalJSON.
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(jsonSchema))
	if err != nil {
		return kaitenerrors.UnprocessableEntity(
			"MetadataField.SchemaShape.InvalidJSON",
			fmt.Sprintf("json_schema is not valid JSON: %s", err),
		)
	}
	if err := c.AddResource(resourceID, doc); err != nil {
		return kaitenerrors.UnprocessableEntity(
			"MetadataField.SchemaShape.InvalidJSON",
			fmt.Sprintf("json_schema is not valid JSON: %s", err),
		)
	}

	if _, err := c.Compile(resourceID); err != nil {
		return kaitenerrors.UnprocessableEntity(
			"MetadataField.SchemaShape.Invalid",
			fmt.Sprintf("json_schema is not a valid JSON Schema 2020-12 document: %s", err),
		)
	}

	// JSON Schema 2020-12 makes `items` optional on `type: array` (an
	// unconstrained array is technically valid). v1 of typed metadata does
	// not support unconstrained arrays — they would punt all type-checking
	// to validation time without any contract for the admin UI to render.
	// We reject them explicitly here.
	var parsed any
	if err := json.Unmarshal(jsonSchema, &parsed); err != nil {
		// Should not happen — compile already validated, but be defensive.
		return kaitenerrors.UnprocessableEntity(
			"MetadataField.SchemaShape.InvalidJSON",
			fmt.Sprintf("json_schema is not valid JSON: %s", err),
		)
	}
	if err := requireItemsForArrays(parsed, ""); err != nil {
		return err
	}

	return nil
}

// requireItemsForArrays walks the parsed schema and reports an
// UnprocessableEntity for any (sub)schema with `type: array` missing an
// `items` keyword. The path argument tracks the JSON Pointer-like location
// of the offending node so the error message is actionable when the schema
// nests (e.g. inside a top-level object's properties).
func requireItemsForArrays(node any, path string) error {
	obj, ok := node.(map[string]any)
	if !ok {
		return nil
	}

	if t, _ := obj["type"].(string); t == "array" {
		if _, hasItems := obj["items"]; !hasItems {
			location := path
			if location == "" {
				location = "(root)"
			}
			return kaitenerrors.UnprocessableEntity(
				"MetadataField.SchemaShape.ArrayMissingItems",
				fmt.Sprintf("array schema at %s must declare an `items` subschema", location),
			)
		}
	}

	// Recurse into common containers — covers properties / items / oneOf /
	// anyOf / allOf / not. We don't pretend to cover every keyword; only the
	// simple shapes above are seeded.
	if props, ok := obj["properties"].(map[string]any); ok {
		for k, v := range props {
			if err := requireItemsForArrays(v, path+"/properties/"+k); err != nil {
				return err
			}
		}
	}
	if items, ok := obj["items"]; ok {
		if err := requireItemsForArrays(items, path+"/items"); err != nil {
			return err
		}
	}
	for _, keyword := range []string{"oneOf", "anyOf", "allOf"} {
		if arr, ok := obj[keyword].([]any); ok {
			for i, sub := range arr {
				if err := requireItemsForArrays(sub, fmt.Sprintf("%s/%s/%d", path, keyword, i)); err != nil {
					return err
				}
			}
		}
	}
	if not, ok := obj["not"]; ok {
		if err := requireItemsForArrays(not, path+"/not"); err != nil {
			return err
		}
	}
	return nil
}
