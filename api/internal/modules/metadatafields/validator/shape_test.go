package validator

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func TestValidateSchemaShape(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		schema   string
		wantOK   bool
		wantCode string // expected error code prefix when wantOK == false
	}{
		{
			name:   "valid string",
			schema: `{"type": "string"}`,
			wantOK: true,
		},
		{
			name:   "valid enum",
			schema: `{"type": "string", "enum": ["a", "b", "c"]}`,
			wantOK: true,
		},
		{
			name:   "valid array of enum",
			schema: `{"type": "array", "items": {"type": "string", "enum": ["x"]}, "uniqueItems": true}`,
			wantOK: true,
		},
		{
			name:   "valid date format",
			schema: `{"type": "string", "format": "date"}`,
			wantOK: true,
		},
		{
			name:     "empty bytes rejected",
			schema:   "",
			wantOK:   false,
			wantCode: "MetadataField.SchemaShape.Empty",
		},
		{
			name:     "not JSON",
			schema:   `{type:string}`,
			wantOK:   false,
			wantCode: "MetadataField.SchemaShape.InvalidJSON",
		},
		{
			name:     "type is not a known JSON Schema type",
			schema:   `{"type": "foo"}`,
			wantOK:   false,
			wantCode: "MetadataField.SchemaShape.Invalid",
		},
		{
			name:     "enum must be an array",
			schema:   `{"type": "string", "enum": "not-an-array"}`,
			wantOK:   false,
			wantCode: "MetadataField.SchemaShape.Invalid",
		},
		{
			name:     "array without items rejected (v1 business rule)",
			schema:   `{"type": "array"}`,
			wantOK:   false,
			wantCode: "MetadataField.SchemaShape.ArrayMissingItems",
		},
		{
			name:   "array with items accepted",
			schema: `{"type": "array", "items": {"type": "string"}}`,
			wantOK: true,
		},
		{
			name:     "nested array without items rejected",
			schema:   `{"type": "object", "properties": {"labels": {"type": "array"}}}`,
			wantOK:   false,
			wantCode: "MetadataField.SchemaShape.ArrayMissingItems",
		},
		{
			name:     "additionalProperties must be a boolean or schema",
			schema:   `{"type": "object", "additionalProperties": "yes"}`,
			wantOK:   false,
			wantCode: "MetadataField.SchemaShape.Invalid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := ValidateSchemaShape([]byte(tt.schema))
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
