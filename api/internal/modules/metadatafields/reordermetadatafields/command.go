package reordermetadatafields

import "github.com/google/uuid"

// ReorderMetadataFieldsInput is the input of POST /metadata-fields/reorder.
// The slice order is significant: the i-th id is assigned displayOrder=i.
type ReorderMetadataFieldsInput struct {
	IDs []uuid.UUID `json:"ids"`
}
