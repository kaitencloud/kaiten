package getmetadatafields

import "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"

// Command is the input of GET /metadata-fields?resourceType=...
// IncludeArchived adds the archived fields, the only way to learn the id
// unarchive-metadata-field takes.
type Command struct {
	ResourceType    db.MetadataFieldResourceType
	IncludeArchived bool
}
