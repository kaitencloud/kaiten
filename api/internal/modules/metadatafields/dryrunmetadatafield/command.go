package dryrunmetadatafield

import "github.com/google/uuid"

// Command is the input of POST /metadata-fields/{id}/dry-run.
type Command struct {
	ID         uuid.UUID
	JSONSchema map[string]any
}

// ImpactSample identifies one resource impacted by a candidate schema change.
type ImpactSample struct {
	Name string `json:"name" doc:"Resource display name"`
	Slug string `json:"slug" doc:"Resource slug"`
}

// Impact is the aggregated result of a dry-run: how many resources of the
// field's resource type carry a value under the field's key that would no
// longer satisfy the candidate schema, plus a small sample for display.
type Impact struct {
	Count   int            `json:"count" doc:"Number of resources whose stored value for this field would no longer satisfy the candidate schema"`
	Samples []ImpactSample `json:"samples" doc:"Up to 5 impacted resources, for display"`
}
