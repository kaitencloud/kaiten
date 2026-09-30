// Package schema exposes the public DTO of the metadatafields module — the
// shape returned by the REST API and embedded in outbox events. It is kept
// separate from the sqlc row type so the API surface can evolve without
// touching the storage layer.
package schema

import (
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// MetadataField is the API representation of a metadata_field row.
//
// JsonSchema is a free-form map carrying a JSON Schema 2020-12 document.
// validator.ValidateSchemaShape checks the format on write;
// validator.ValidateSchemaTransition constrains what an update may change.
//
// ResourceType is typed by the generated enum rather than mapped in dbmap like
// every other wire field, because the enum is the module's vocabulary, not this
// DTO's: the commands, the validator's whole exported API, the seeder, the
// GraphQL layer and gqlgen.yml's SDL binding all name it. The published
// contract does not depend on the choice -- the struct tag serializes it as an
// inline string enum -- so retyping it later moves no component.
//
// Reused unmodified as the request body for create and update, and as the
// response for both plus get. ID/ArchivedAt/CreatedBy/CreatedAt/UpdatedBy/
// UpdatedAt are readOnly:"true"; archiving has its own endpoints.
//
// ResourceType and Key stay required rather than create-only: both are always
// present on a read and immutable once set, so expecting update to echo the
// stored value carries no staleness risk. The handler rejects a mismatch.
//
// DisplayOrder is different -- the reorder endpoint changes it underneath a
// field, so echoing a snapshot taken when an edit dialog opened would clobber a
// concurrent reorder, and the update form never sends it. required:"false"
// rather than omitempty because 0 is a valid position.
type MetadataField struct {
	ID           uuid.UUID                    `json:"id" readOnly:"true" doc:"Unique identifier" example:"123e4567-e89b-12d3-a456-426614174000"`
	ResourceType db.MetadataFieldResourceType `json:"resourceType" enum:"DEPLOYMENT_ZONE,INSTANCE" doc:"Resource type this field applies to. Immutable after creation; update must echo back the stored value."`
	Key          string                       `json:"key" doc:"Stable identifier, unique per (organization, resource type) on non-archived rows. Immutable after creation; update must echo back the stored value." example:"region" minLength:"1" maxLength:"100"`
	Label        string                       `json:"label" doc:"Human-readable label shown in the admin UI" example:"Region" minLength:"1" maxLength:"100"`
	JSONSchema   map[string]any               `json:"jsonSchema" doc:"JSON Schema 2020-12 document describing the value space. Example: {\"type\":\"string\",\"enum\":[\"a\",\"b\"]}"`
	DisplayOrder int32                        `json:"displayOrder" required:"false" doc:"Sort order in the admin UI; ties are broken by createdAt ASC. Settable only through POST /metadata-fields/reorder; never echoed back on update." example:"0"`
	ArchivedAt   *time.Time                   `json:"archivedAt,omitempty" readOnly:"true" doc:"Timestamp when the field was archived (soft delete). Absent if active."`
	CreatedBy    shared.User                  `json:"createdBy" readOnly:"true" doc:"User who created this field"`
	CreatedAt    time.Time                    `json:"createdAt" readOnly:"true" doc:"Timestamp when the field was created" example:"2026-05-26T12:00:00Z"`
	UpdatedBy    shared.User                  `json:"updatedBy" readOnly:"true" doc:"User who last updated this field"`
	UpdatedAt    time.Time                    `json:"updatedAt" readOnly:"true" doc:"Timestamp when the field was last updated" example:"2026-05-26T12:00:00Z"`
}

// MetadataFieldPage is a cursor-paginated page of metadata fields, returned by
// the GraphQL metadataFields field -- the GraphQL counterpart of the REST
// getmetadatafields endpoint's pagination.Page[*MetadataField] envelope. It is
// a plain (non-generic) struct, rather than pagination.Page itself, because
// gqlgen's model binding (see gqlgen.yml) needs a concrete Go type to bind the
// MetadataFieldPage GraphQL type to.
type MetadataFieldPage struct {
	Items      []MetadataField
	NextCursor *string
	HasMore    bool
}
