package createmetadatafield

import "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"

// CreateMetadataFieldInput carries the inputs of POST /metadata-fields.
//
// The `enum:` huma tag on ResourceType is what makes openapi.yaml emit the
// allowed values and what the SDK uses to refuse bad inputs at client-side
// validation. Without it, the field is just a string and a typo would only
// surface at INSERT time as a Postgres enum-cast error.
//
// JSONSchema is a JSON Schema 2020-12 document (parsed as map[string]any by
// huma); the validator marshals + checks shape before insertion.
type CreateMetadataFieldInput struct {
	ResourceType db.MetadataFieldResourceType `json:"resourceType" enum:"DEPLOYMENT_ZONE,INSTANCE"`
	Key          string                       `json:"key"`
	Label        string                       `json:"label"`
	JSONSchema   map[string]any               `json:"jsonSchema"`
	DisplayOrder int32                        `json:"displayOrder"`
}
