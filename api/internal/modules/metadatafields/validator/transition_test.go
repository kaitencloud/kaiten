package validator

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestValidateSchemaTransition(t *testing.T) {
	t.Parallel()

	type testCase struct {
		name     string
		oldS     map[string]any
		newS     map[string]any
		wantOK   bool
		wantCode string
	}

	cases := []testCase{
		// --- Accepted transitions ---
		{
			name:   "identical schema",
			oldS:   map[string]any{"type": "string"},
			newS:   map[string]any{"type": "string"},
			wantOK: true,
		},
		{
			name:   "label/description only (no type)",
			oldS:   map[string]any{"type": "string", "description": "region id"},
			newS:   map[string]any{"type": "string", "description": "the cloud region id"},
			wantOK: true,
		},
		{
			name:   "enum value addition",
			oldS:   map[string]any{"type": "string", "enum": []any{"a", "b"}},
			newS:   map[string]any{"type": "string", "enum": []any{"a", "b", "c"}},
			wantOK: true,
		},
		{
			name:   "enum value reorder",
			oldS:   map[string]any{"type": "string", "enum": []any{"a", "b", "c"}},
			newS:   map[string]any{"type": "string", "enum": []any{"c", "a", "b"}},
			wantOK: true,
		},
		{
			name:   "enum value removal allowed",
			oldS:   map[string]any{"type": "string", "enum": []any{"a", "b", "c"}},
			newS:   map[string]any{"type": "string", "enum": []any{"a", "b"}},
			wantOK: true,
		},
		{
			name:   "array of enum: value addition inside items",
			oldS:   map[string]any{"type": "array", "items": map[string]any{"type": "string", "enum": []any{"a"}}},
			newS:   map[string]any{"type": "array", "items": map[string]any{"type": "string", "enum": []any{"a", "b"}}},
			wantOK: true,
		},
		{
			// integer and number are the same numeric family. The admin UI
			// only emits {type:"number"}, so editing (even just the label of)
			// a raw-JSON-created integer field must not be rejected.
			name:   "integer → number (numeric family widening)",
			oldS:   map[string]any{"type": "integer"},
			newS:   map[string]any{"type": "number"},
			wantOK: true,
		},
		{
			name:   "number → integer (numeric family, dry-run guards narrowing)",
			oldS:   map[string]any{"type": "number"},
			newS:   map[string]any{"type": "integer"},
			wantOK: true,
		},
		{
			name:   "array<integer> → array<number> (numeric family inside items)",
			oldS:   map[string]any{"type": "array", "items": map[string]any{"type": "integer"}},
			newS:   map[string]any{"type": "array", "items": map[string]any{"type": "number"}},
			wantOK: true,
		},
		{
			name:   "integer label-only edit (description change)",
			oldS:   map[string]any{"type": "integer", "description": "seats"},
			newS:   map[string]any{"type": "integer", "description": "licensed seats"},
			wantOK: true,
		},

		// --- Rejected: type change ---
		{
			name:     "string → number",
			oldS:     map[string]any{"type": "string"},
			newS:     map[string]any{"type": "number"},
			wantOK:   false,
			wantCode: "SchemaTransition.TypeChanged",
		},
		{
			name:     "number → boolean",
			oldS:     map[string]any{"type": "number"},
			newS:     map[string]any{"type": "boolean"},
			wantOK:   false,
			wantCode: "SchemaTransition.TypeChanged",
		},

		// --- Rejected: cardinality change ---
		{
			name:     "string → array<string>",
			oldS:     map[string]any{"type": "string"},
			newS:     map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			wantOK:   false,
			wantCode: "SchemaTransition.TypeChanged",
		},
		{
			name:     "array<string> → array<number>",
			oldS:     map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			newS:     map[string]any{"type": "array", "items": map[string]any{"type": "number"}},
			wantOK:   false,
			wantCode: "SchemaTransition.CardinalityChanged",
		},

		// --- Rejected: enum wrap toggle ---
		{
			name:     "free string → string with enum",
			oldS:     map[string]any{"type": "string"},
			newS:     map[string]any{"type": "string", "enum": []any{"a"}},
			wantOK:   false,
			wantCode: "SchemaTransition.EnumWrapToggled",
		},
		{
			name:     "string with enum → free string",
			oldS:     map[string]any{"type": "string", "enum": []any{"a"}},
			newS:     map[string]any{"type": "string"},
			wantOK:   false,
			wantCode: "SchemaTransition.EnumWrapToggled",
		},
		{
			name:     "array<free string> → array<string with enum>",
			oldS:     map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
			newS:     map[string]any{"type": "array", "items": map[string]any{"type": "string", "enum": []any{"a"}}},
			wantOK:   false,
			wantCode: "SchemaTransition.EnumWrapToggled",
		},
	}

	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := ValidateSchemaTransition(tt.oldS, tt.newS)
			if tt.wantOK {
				assert.NoError(t, err)
				return
			}
			require.Error(t, err)
			assert.True(t, kaitenerrors.IsUnprocessable(err),
				"expected an Unprocessable (422) error, got %v", err)
			if tt.wantCode != "" {
				var kerr *kaitenerrors.Error
				require.ErrorAs(t, err, &kerr)
				assert.Equal(t, tt.wantCode, kerr.Code)
			}
		})
	}
}
