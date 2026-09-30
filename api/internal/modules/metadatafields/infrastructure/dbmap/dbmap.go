// Package dbmap translates the metadatafields module's sqlc row types into its
// schema DTOs.
//
// It exists so the translation has a home that is allowed to know both, and
// schema does not. A wire type that imports infrastructure/db inverts the
// dependency the schema package is for: the DTO is what the contract promises
// and the row is what storage happens to hold today, so a schema package that
// names a generated type makes every regeneration a potential contract change.
// The mapping still has to name both -- that is what mapping is -- so it lives
// here, under infrastructure/, where naming a row type is the point rather than
// a leak.
//
// Direction: dbmap imports db and schema; neither imports dbmap. Repositories
// are the callers, which is where a row already exists.
//
// This module is the one where moving the mapping out did not finish the job:
// schema.MetadataField.ResourceType is still db.MetadataFieldResourceType. See
// the note on that field for what closing it costs and why it is not this
// change.
package dbmap

import (
	"encoding/json"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// ToMetadataField converts a metadata_field row into the API DTO.
//
// The stored json_schema is unmarshalled back to map[string]any so the
// caller (and downstream JSON serialization) sees the structured form
// expected by the OpenAPI spec — not raw bytes. An unmarshal failure means
// the row is corrupted in the DB; we surface that as a plain error so the
// caller can log/abort.
//
// User names are not joined here (the queries do SELECT * on metadata_field
// only). Callers that need a display name should resolve it from the
// dataloader pattern at the GraphQL/HTTP layer.
func ToMetadataField(row db.MetadataField) (*schema.MetadataField, error) {
	var jsonSchema map[string]any
	if err := json.Unmarshal(row.JsonSchema, &jsonSchema); err != nil {
		return nil, fmt.Errorf("metadatafields/dbmap: unmarshalling stored json_schema for field %q: %w", row.Key, err)
	}

	dto := &schema.MetadataField{
		ID:           row.ID,
		ResourceType: row.ResourceType,
		Key:          row.Key,
		Label:        row.Label,
		JSONSchema:   jsonSchema,
		DisplayOrder: row.DisplayOrder,
		CreatedBy:    shared.User{ID: row.CreatedByID},
		CreatedAt:    row.CreatedAt.Time,
		UpdatedBy:    shared.User{ID: row.UpdatedByID},
		UpdatedAt:    row.UpdatedAt.Time,
	}
	if row.ArchivedAt.Valid {
		t := row.ArchivedAt.Time
		dto.ArchivedAt = &t
	}
	return dto, nil
}
