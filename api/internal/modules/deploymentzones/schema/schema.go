package schema

import (
	"time"

	"github.com/google/uuid"

	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// DeploymentZone is one place a customer of this Kaiten runs a release: a
// target they name and classify themselves, holding the release currently on it.
//
// Not an installation of Kaiten: the operations vocabulary uses the same two
// words for one, and that one is invisible here.
// DeploymentZone is reused unmodified as the request body for both
// create-deployment-zone and update-deployment-zone, as well as the response
// for both and get-deployment-zone. ID/CreatedBy/CreatedAt/UpdatedBy/
// UpdatedAt are readOnly:"true" (server-assigned). Slug is accepted on
// create but not settable through update-deployment-zone -- its handler
// rejects it being present and different from the current slug with a 422.
type DeploymentZone struct {
	ID   uuid.UUID `json:"id" readOnly:"true" doc:"Unique identifier for the deployment zone" example:"123e4567-e89b-12d3-a456-426614174000"`
	Name string    `json:"name" doc:"Name of the deployment zone" example:"AWS us-west-2" minLength:"1"`
	Slug string    `json:"slug,omitempty" doc:"Optional URL-friendly identifier, unique per organization. Auto-generated if not provided." example:"aws-us-west-2" minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	Type string    `json:"type" doc:"Environment class of the deployment zone. Free-form: any value is stored as sent, but production, staging and development are the ones the console labels, and feature-flag targeting rules match on this field as __kaiten.deploymentZone.type." example:"production"`
	// Metadata is required:"false" rather than omitempty: an omitempty map
	// drops an empty-but-present value from the response, which decodes back
	// as nil rather than {} -- a mismatch when compared against a value
	// hydrated in-process instead of over the wire (see the identical
	// instances/schema.Instance.Metadata, caught by TestGetInstances).
	Metadata    map[string]interface{} `json:"metadata" required:"false" doc:"Typed metadata for the deployment zone, validated against the org-scoped MetadataField schema" example:"{\"region\":\"eu-west-1\"}"`
	Description string                 `json:"description" doc:"Description of the deployment zone" example:"2023-10-01T12:00:00Z"`
	ReleaseID   *uuid.UUID             `json:"releaseId,omitempty" doc:"Currently deployed release ID" example:"123e4567-e89b-12d3-a456-426614174000"`
	CreatedBy   shared.User            `json:"createdBy" readOnly:"true" doc:"User who created this deployment zone"`
	CreatedAt   time.Time              `json:"createdAt" readOnly:"true" doc:"Timestamp when the deployment zone was created" example:"2023-10-01T12:00:00Z"`
	UpdatedBy   shared.User            `json:"updatedBy" readOnly:"true" doc:"User who last updated the deployment zone"`
	UpdatedAt   time.Time              `json:"updatedAt" readOnly:"true" doc:"Timestamp when the deployment zone was last updated" example:"2023-10-01T12:00:00Z"`
}

// DeploymentZonePage is a cursor-paginated page of deployment zones,
// returned by the GraphQL deploymentZones field -- the GraphQL counterpart of
// the REST getdeploymentzones endpoint's pagination.Page[*DeploymentZone]
// envelope. It is a plain (non-generic) struct, rather than pagination.Page
// itself, because gqlgen's model binding (see gqlgen.yml) needs a concrete Go
// type to bind the DeploymentZonePage GraphQL type to.
type DeploymentZonePage struct {
	Items      []DeploymentZone
	NextCursor *string
	HasMore    bool
}

// Deployment is one entry in a zone's deployment log: it records that a
// release was put on a zone at a moment in time, not that it is the one
// running now (DeploymentZone.ReleaseID answers that). The same release can
// appear against the same zone more than once -- that is what a rollback
// looks like.
type Deployment struct {
	ID               uuid.UUID   `json:"id" doc:"Unique identifier for this deployment event" example:"123e4567-e89b-12d3-a456-426614174000"`
	DeploymentZoneID uuid.UUID   `json:"deploymentZoneId" doc:"Deployment zone the release was deployed to" example:"123e4567-e89b-12d3-a456-426614174000"`
	ReleaseID        uuid.UUID   `json:"releaseId" doc:"Release that was deployed" example:"123e4567-e89b-12d3-a456-426614174000"`
	CreatedBy        shared.User `json:"createdBy" doc:"User who recorded this deployment"`
	CreatedAt        time.Time   `json:"createdAt" doc:"Timestamp when the deployment was recorded" example:"2023-10-01T12:00:00Z"`
}
