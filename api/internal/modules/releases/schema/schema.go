package schema

import (
	"time"

	"github.com/google/uuid"

	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// Release is reused unmodified as the request body for create-release, as
// well as the response for it and get-release/get-releases. It is
// immutable -- there is no PUT or PATCH on /releases, and the component list
// is fixed at creation, so the only edit is DELETE followed by a fresh
// create, which loses the deployment history attached to the old id. It
// therefore carries no updatedBy/updatedAt: they existed and were
// permanently equal to createdBy/createdAt.
//
// ID/CreatedBy/CreatedAt are readOnly:"true" (server-assigned). Components
// (readOnly:"true") is the resolved, embedded read view; ComponentIDs
// (writeOnly:"true") is how a client names the same components on create --
// two views of one relationship, the same pattern as Entitlement's
// GroupSlugs/EntitlementGroups.
type Release struct {
	ID          uuid.UUID   `json:"id" readOnly:"true" example:"123e4567-e89b-12d3-a456-426614174000" doc:"Unique identifier for the release"`
	Version     string      `json:"version" example:"v1.0.0" doc:"Version of the release" minLength:"1" maxLength:"100"`
	Slug        string      `json:"slug,omitempty" example:"v1-0-0" doc:"Optional URL-friendly identifier, unique per organization. Auto-generated if not provided." minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	Description *string     `json:"description,omitempty" example:"This release fixes everything. CHANGELOG: stuff was done" doc:"Description of the release" maxLength:"500"`
	CreatedBy   shared.User `json:"createdBy" readOnly:"true" doc:"User who created this release"`
	CreatedAt   time.Time   `json:"createdAt" readOnly:"true" example:"2023-10-01T12:00:00Z" doc:"Timestamp when the release was created"`

	ComponentIDs []uuid.UUID                 `json:"componentIds,omitempty" writeOnly:"true" example:"123e4567-e89b-12d3-a456-426614174000" doc:"List of component IDs to link to this release"`
	Components   []componentschema.Component `json:"components,omitempty" readOnly:"true" doc:"List of components included in this release, fixed at creation"`
}

// ReleasePage is a cursor-paginated page of releases, returned by the
// GraphQL releases field -- the GraphQL counterpart of the REST
// getreleases endpoint's pagination.Page[*Release] envelope. It is a
// plain (non-generic) struct, rather than pagination.Page itself, because
// gqlgen's model binding (see gqlgen.yml) needs a concrete Go type to bind
// the ReleasePage GraphQL type to.
type ReleasePage struct {
	Items      []Release
	NextCursor *string
	HasMore    bool
}
