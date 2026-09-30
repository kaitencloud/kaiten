package validator

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
)

func mkField(key, schemaJSON string) db.MetadataField {
	return db.MetadataField{
		Key:        key,
		JsonSchema: []byte(schemaJSON),
	}
}

func mkArchivedField(key, schemaJSON string) db.MetadataField {
	f := mkField(key, schemaJSON)
	f.ArchivedAt = pgtype.Timestamp{Time: time.Now(), Valid: true}
	return f
}

func TestBuildResourceSchema(t *testing.T) {
	t.Parallel()

	t.Run("strict mode: additionalProperties is false", func(t *testing.T) {
		t.Parallel()
		fields := []db.MetadataField{
			mkField("region", `{"type":"string"}`),
			mkField("tier", `{"type":"string","enum":["a","b"]}`),
		}
		out, err := BuildResourceSchema(fields, true)
		require.NoError(t, err)

		var got map[string]any
		require.NoError(t, json.Unmarshal(out, &got))

		assert.Equal(t, "object", got["type"])
		assert.Equal(t, false, got["additionalProperties"])
		assert.Equal(t, "https://json-schema.org/draft/2020-12/schema", got["$schema"])
		props, ok := got["properties"].(map[string]any)
		require.True(t, ok)
		assert.Len(t, props, 2)
		assert.Contains(t, props, "region")
		assert.Contains(t, props, "tier")
	})

	t.Run("tolerant mode: additionalProperties is true", func(t *testing.T) {
		t.Parallel()
		out, err := BuildResourceSchema([]db.MetadataField{
			mkField("environment", `{"type":"string"}`),
		}, false)
		require.NoError(t, err)

		var got map[string]any
		require.NoError(t, json.Unmarshal(out, &got))
		assert.Equal(t, true, got["additionalProperties"])
	})

	t.Run("empty field list yields empty properties", func(t *testing.T) {
		t.Parallel()
		out, err := BuildResourceSchema(nil, true)
		require.NoError(t, err)

		var got map[string]any
		require.NoError(t, json.Unmarshal(out, &got))
		props, _ := got["properties"].(map[string]any)
		assert.Empty(t, props)
	})

	t.Run("inner enum is preserved verbatim", func(t *testing.T) {
		t.Parallel()
		fields := []db.MetadataField{
			mkField("tier", `{"type":"string","enum":["production","staging"]}`),
		}
		out, err := BuildResourceSchema(fields, true)
		require.NoError(t, err)

		var got map[string]any
		require.NoError(t, json.Unmarshal(out, &got))
		props := got["properties"].(map[string]any)
		tier := props["tier"].(map[string]any)
		assert.Equal(t, "string", tier["type"])
		assert.Equal(t, []any{"production", "staging"}, tier["enum"])
	})

	t.Run("array<enum> is preserved verbatim", func(t *testing.T) {
		t.Parallel()
		fields := []db.MetadataField{
			mkField("labels", `{"type":"array","items":{"type":"string","enum":["x","y"]},"uniqueItems":true}`),
		}
		out, err := BuildResourceSchema(fields, true)
		require.NoError(t, err)

		var got map[string]any
		require.NoError(t, json.Unmarshal(out, &got))
		props := got["properties"].(map[string]any)
		labels := props["labels"].(map[string]any)
		assert.Equal(t, "array", labels["type"])
		assert.Equal(t, true, labels["uniqueItems"])
		items := labels["items"].(map[string]any)
		assert.Equal(t, []any{"x", "y"}, items["enum"])
	})

	t.Run("corrupted stored schema returns a clear error", func(t *testing.T) {
		t.Parallel()
		fields := []db.MetadataField{
			mkField("broken", `{this is not json`),
		}
		_, err := BuildResourceSchema(fields, true)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "broken")
	})

	t.Run("empty stored schema is flagged as corrupted", func(t *testing.T) {
		t.Parallel()
		fields := []db.MetadataField{
			mkField("empty", ``),
		}
		_, err := BuildResourceSchema(fields, true)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "empty")
	})
}
