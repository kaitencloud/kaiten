package unarchivemetadatafield

import "github.com/google/uuid"

// Command is the input of POST /metadata-fields/{id}/unarchive.
type Command struct {
	ID uuid.UUID
}
