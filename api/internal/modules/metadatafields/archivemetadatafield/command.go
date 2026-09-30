package archivemetadatafield

import "github.com/google/uuid"

// Command is the input of POST /metadata-fields/{id}/archive.
type Command struct {
	ID uuid.UUID
}
