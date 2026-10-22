// Package schema defines users' stored, organization-membership authorization.
package schema

import (
	"fmt"
	"slices"
	"strings"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

const (
	RoleAdministrator = "administrator"
	RoleViewer        = "viewer"
	RoleEditor        = "editor"
)

// UserAuthorization is an assignment, not JWT claims. Empty is deny by default.
// Permissions are explicit OrganizationScopes; wildcard grants come from roles
// only. In particular, write:users can never turn a member into an administrator.
type UserAuthorization struct {
	Enabled     bool     `json:"enabled"`
	Roles       []string `json:"roles" nullable:"false"`
	Permissions []string `json:"permissions" nullable:"false"`
}

func BuiltInRoles() []string {
	return []string{RoleAdministrator, RoleViewer, RoleEditor}
}

func (a UserAuthorization) Validate() error {
	for _, role := range a.Roles {
		if !slices.Contains(BuiltInRoles(), role) {
			return fmt.Errorf("invalid built-in role: %q", role)
		}
	}
	permissions := scope.OrganizationScopes()
	for _, permission := range a.Permissions {
		if !slices.Contains(permissions, permission) {
			return fmt.Errorf("invalid organization permission: %q", permission)
		}
	}
	return nil
}

// IsAdministrator must gate administrator management independently of scopes.
func (a UserAuthorization) IsAdministrator() bool {
	return a.Enabled && slices.Contains(a.Roles, RoleAdministrator)
}

// EffectiveScopes expands validated stored assignments for existing scope gates.
// Validation failures return no grants; unknown stored values must fail closed.
func (a UserAuthorization) EffectiveScopes() []string {
	if !a.Enabled || a.Validate() != nil {
		return []string{}
	}
	if a.IsAdministrator() {
		return []string{scope.WriteAll()}
	}
	grants := append([]string{scope.Read(scope.Profile)}, a.Permissions...)
	for _, permission := range scope.OrganizationScopes() {
		if slices.Contains(a.Roles, RoleEditor) && strings.HasPrefix(permission, "write:") ||
			slices.Contains(a.Roles, RoleViewer) && strings.HasPrefix(permission, "read:") {
			grants = append(grants, permission)
		}
	}
	slices.Sort(grants)
	return slices.Compact(grants)
}
