// Package schema defines users' stored, organization-membership authorization.
package schema

import (
	"fmt"
	"slices"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

const (
	RoleAdministrator = "administrator"
	RoleViewer        = "viewer"
	RoleEditor        = "editor"
)

// UserAuthorization is an assignment, not JWT claims. Empty is deny by default.
// Permissions are explicit OrganizationScopes; wildcard grants come from roles
// only. Management additionally checks current and proposed authority.
type UserAuthorization struct {
	Enabled     bool     `json:"enabled"`
	Roles       []string `json:"roles" nullable:"false"`
	Permissions []string `json:"permissions" nullable:"false"`
}

func BuiltInRoles() []string {
	return []string{RoleAdministrator, RoleViewer, RoleEditor}
}

// Validate checks syntax only. Storage must check custom role existence in the
// current organization before accepting assignments or expanding authority.
func (a UserAuthorization) Validate() error {
	for _, role := range a.Roles {
		if !ValidRoleSlug(role) {
			return fmt.Errorf("invalid role slug: %q", role)
		}
	}
	return validatePermissions(a.Permissions)
}

// IsAdministrator identifies the protected built-in role for continuity checks.
func (a UserAuthorization) IsAdministrator() bool {
	return a.Enabled && slices.Contains(a.Roles, RoleAdministrator)
}

// EffectiveScopes expands validated stored assignments for existing scope gates.
// Validation failures return no grants; unknown stored values must fail closed.
func (a UserAuthorization) EffectiveScopes(customRoles ...Role) []string {
	if !a.Enabled || a.Validate() != nil {
		return []string{}
	}
	catalog := append(RoleTemplates(), customRoles...)
	grants := append([]string{scope.Read(scope.Profile)}, a.Permissions...)
	for _, slug := range a.Roles {
		index := slices.IndexFunc(catalog, func(role Role) bool { return role.Slug == slug })
		if index < 0 {
			return []string{}
		}
		role := catalog[index]
		if !role.BuiltIn && (role.IsAdministrator || validatePermissions(role.Permissions) != nil) {
			return []string{}
		}
		grants = append(grants, role.Permissions...)
	}
	if a.IsAdministrator() {
		return []string{scope.WriteAll()}
	}
	slices.Sort(grants)
	return slices.Compact(grants)
}
