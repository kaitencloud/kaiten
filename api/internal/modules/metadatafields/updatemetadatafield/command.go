package updatemetadatafield

import (
	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
)

// UpdateMetadataFieldInput carries the inputs of PATCH /metadata-fields/{id}.
//
//   - `key` and `resourceType` are immutable after creation.
//   - `displayOrder` is *not* part of the update payload: it is exclusively
//     driven by the dedicated POST /metadata-fields/reorder endpoint. This
//     keeps long-running edit dialogs from rewinding the ordering with a
//     stale snapshot.
type UpdateMetadataFieldInput struct {
	// ID is injected from the URL path by the endpoint, not sent in the body.
	// `json:"-"` keeps it out of huma's body validation.
	ID         uuid.UUID      `json:"-"`
	Label      string         `json:"label"`
	JSONSchema map[string]any `json:"jsonSchema"`
	// ResourceType, Key and DisplayOrder are structurally writable on the
	// shared wire schema (schema.MetadataField) but immutable/not-settable
	// through this endpoint. Carried through so Execute can reject a value
	// that differs from what's stored -- see its doc comment.
	ResourceType db.MetadataFieldResourceType
	Key          string
	DisplayOrder int32
}
