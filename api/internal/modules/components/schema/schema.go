package schema

import (
	"time"

	"github.com/google/uuid"

	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// Component is reused unmodified as the request body for both
// create-component and update-component, as well as the response for both
// and get-component. ID/CreatedBy/CreatedAt are readOnly:"true" (server-
// assigned). PreviousComponentID is accepted on create but not settable
// through update-component -- the link to a previous version is set once,
// at creation, and an update that has to version the component derives it
// itself; its handler rejects it being present with a 422 rather than
// silently ignoring it.
type Component struct {
	ID                  uuid.UUID   `json:"id" readOnly:"true" example:"123e4567-e89b-12d3-a456-426614174000" doc:"Unique identifier for the component"`
	PreviousComponentID *uuid.UUID  `json:"previousComponentId,omitempty" example:"123e4567-e89b-12d3-a456-426614174000" doc:"Reference to the previous version of this component"`
	Name                string      `json:"name" example:"api-gateway" doc:"Name of the component" minLength:"1" maxLength:"100"`
	Version             string      `json:"version" example:"v1.2.3" doc:"Version of the component" minLength:"1" maxLength:"100"`
	Slug                string      `json:"slug,omitempty" example:"api-gateway-v1-2-3" doc:"Optional URL-friendly identifier, unique per organization. Auto-generated if not provided." minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	Description         *string     `json:"description,omitempty" example:"Main API gateway component" doc:"Description of the component" maxLength:"500"`
	CreatedBy           shared.User `json:"createdBy" readOnly:"true" doc:"User who created this component"`
	CreatedAt           time.Time   `json:"createdAt" readOnly:"true" doc:"Timestamp when the component was created" example:"2023-10-01T12:00:00Z"`
}

// ComponentPage is a cursor-paginated page of components, returned by the
// GraphQL components field -- the GraphQL counterpart of the REST
// getcomponents endpoint's pagination.Page[*Component] envelope. It is a
// plain (non-generic) struct, rather than pagination.Page itself, because
// gqlgen's model binding (see gqlgen.yml) needs a concrete Go type to bind
// the ComponentPage GraphQL type to.
type ComponentPage struct {
	Items      []Component
	NextCursor *string
	HasMore    bool
}
