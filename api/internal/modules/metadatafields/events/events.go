// Package events declares the outbox event metadata published by the
// metadatafields module. Convention matches deploymentzones/events.
package events

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/events"

var (
	MetadataFieldCreated    = events.New("METADATA_FIELD_CREATED", "com.kaiten.metadata_field.v1.created")
	MetadataFieldUpdated    = events.New("METADATA_FIELD_UPDATED", "com.kaiten.metadata_field.v1.updated")
	MetadataFieldArchived   = events.New("METADATA_FIELD_ARCHIVED", "com.kaiten.metadata_field.v1.archived")
	MetadataFieldUnarchived = events.New("METADATA_FIELD_UNARCHIVED", "com.kaiten.metadata_field.v1.unarchived")
	MetadataFieldReordered  = events.New("METADATA_FIELD_REORDERED", "com.kaiten.metadata_field.v1.reordered")
)
