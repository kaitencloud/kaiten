package validator

import (
	"fmt"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// ValidateSchemaTransition enforces the whitelist of allowed mutations
// between the existing schema of a MetadataField and a candidate replacement.
// The rules:
//
//	┌────────────────────────────────────────────────────┬────────┐
//	│ label / description / examples / cosmetic          │ ✅ free  │
//	│ enum value addition                                │ ✅ free  │
//	│ enum value reorder                                 │ ✅ free  │
//	│ enum value removal                                 │ ✅ allowed (warning in the UI) │
//	│ primary `type` change (string ↔ number ↔ …)        │ ❌ 422   │
//	│ cardinality change (wrap / unwrap `array`)         │ ❌ 422   │
//	│ free string ↔ string with enum                     │ ❌ 422   │
//	└────────────────────────────────────────────────────┴────────┘
//
// Returns nil on accepted transitions, or a kaitenerrors.UnprocessableEntity
// with a code (`SchemaTransition.<Reason>`) on rejections. Cosmetic / unknown
// changes outside the table above are accepted.
func ValidateSchemaTransition(oldSchema, newSchema map[string]any) error {
	oldType := primaryType(oldSchema)
	newType := primaryType(newSchema)

	// Primary type change (excluding identical types).
	if oldType != newType {
		return kaitenerrors.UnprocessableEntity(
			"SchemaTransition.TypeChanged",
			fmt.Sprintf("changing the primary type (%q → %q) is not allowed; archive the field and create a new one", oldType, newType),
		)
	}

	// Cardinality: at this point oldType == newType. If both are "array",
	// inspect the items.type — flipping the inner type would otherwise sneak
	// past the previous check.
	if oldType == "array" {
		oldInner := primaryType(itemsOf(oldSchema))
		newInner := primaryType(itemsOf(newSchema))
		if oldInner != newInner {
			return kaitenerrors.UnprocessableEntity(
				"SchemaTransition.CardinalityChanged",
				fmt.Sprintf("changing the items type of an array field (%q → %q) is not allowed", oldInner, newInner),
			)
		}
	}

	// Enum introduction / removal on string fields.
	// "free string ↔ string with enum" is the case the rules call out.
	if oldType == "string" {
		oldHasEnum := hasEnum(oldSchema)
		newHasEnum := hasEnum(newSchema)
		if oldHasEnum != newHasEnum {
			return kaitenerrors.UnprocessableEntity(
				"SchemaTransition.EnumWrapToggled",
				"toggling between a free string and a string with enum is not allowed; archive the field and create a new one",
			)
		}
	}

	// For array<string with enum>, treat the same way on the inner schema.
	if oldType == "array" {
		oldInner := itemsOf(oldSchema)
		newInner := itemsOf(newSchema)
		if primaryType(oldInner) == "string" && primaryType(newInner) == "string" {
			if hasEnum(oldInner) != hasEnum(newInner) {
				return kaitenerrors.UnprocessableEntity(
					"SchemaTransition.EnumWrapToggled",
					"toggling between a free string and a string with enum (inside an array) is not allowed",
				)
			}
		}
	}

	// Everything else — label / description / examples / enum value
	// add/remove/reorder — is accepted. A later change will surface a dry-run warning
	// to the admin before they confirm a removal.
	return nil
}

// primaryType extracts the JSON Schema "type" keyword as a string. Empty when
// absent or not a string (e.g. type: ["string", "null"] which we treat as
// "untyped" for transition purposes — v1 does not seed compound types).
//
// "integer" is normalized to "number": both belong to the same numeric family,
// and the admin UI models them as a single "NUMBER" type (inferUiType) — the
// structured form only ever emits {type:"number"}. Without this collapse a
// field stored as {type:"integer"} (only reachable via the raw-JSON escape
// hatch) could never be edited: even a label-only change re-emits "number" and
// tripped SchemaTransition.TypeChanged. Widening integer→number is always safe;
// the reverse narrowing is only reachable via raw JSON and is surfaced to the
// admin by the dry-run, consistent with how enum-value removal is handled.
func primaryType(schema map[string]any) string {
	if schema == nil {
		return ""
	}
	t, _ := schema["type"].(string)
	if t == "integer" {
		return "number"
	}
	return t
}

// itemsOf returns the "items" subschema if any, else nil.
func itemsOf(schema map[string]any) map[string]any {
	if schema == nil {
		return nil
	}
	items, _ := schema["items"].(map[string]any)
	return items
}

// hasEnum reports whether the schema declares an "enum" array.
func hasEnum(schema map[string]any) bool {
	if schema == nil {
		return false
	}
	v, ok := schema["enum"]
	if !ok {
		return false
	}
	arr, ok := v.([]any)
	return ok && arr != nil
}
