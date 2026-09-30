package getmetadatafields

import "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"

// Command is the input of GET /metadata-fields?resourceType=...
type Command struct {
	ResourceType db.MetadataFieldResourceType
}
