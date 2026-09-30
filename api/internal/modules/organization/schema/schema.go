package schema

import "github.com/google/uuid"

type Organization struct {
	ID         uuid.UUID `json:"id" example:"123e4567-e89b-12d3-a456-426614174000" doc:"Unique identifier for the organization"`
	ExternalID string    `json:"external_id" example:"ext-123e4567-e89b-12d3-a456-426614174000" doc:"External identifier for the organization, used for integration with external systems"`
	Name       string    `json:"name" example:"My Organization" doc:"Display name of the organization"`
}
