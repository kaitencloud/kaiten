package schema

import (
	"time"

	"github.com/google/uuid"
)

// ManagedUser is a human member of the caller's organization. Profile fields identify
// the global user; authorization and enabled state belong to this membership.
type ManagedUser struct {
	ID            uuid.UUID         `json:"id"`
	ExternalID    string            `json:"externalId"`
	Name          string            `json:"name"`
	Email         *string           `json:"email"`
	CreatedAt     time.Time         `json:"createdAt"`
	Authorization UserAuthorization `json:"authorization"`
}

type Profile struct {
	Name  string `json:"name" minLength:"1" maxLength:"200"`
	Email string `json:"email" format:"email" maxLength:"320"`
}

type Me struct {
	User                 ManagedUser `json:"user"`
	OrganizationID       uuid.UUID   `json:"organizationId"`
	Scopes               []string    `json:"scopes" nullable:"false"`
	AvailableRoles       []Role      `json:"availableRoles" nullable:"false"`
	AvailablePermissions []string    `json:"availablePermissions" nullable:"false"`
}

// UserEnablement changes access without replacing role assignments.
type UserEnablement struct {
	Enabled bool `json:"enabled"`
}

// UserRoleAssignments changes roles and direct scopes while preserving enablement.
type UserRoleAssignments struct {
	Roles       []string `json:"roles" nullable:"false"`
	Permissions []string `json:"permissions" nullable:"false"`
}
