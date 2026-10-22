package schema

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

var roleSlug = regexp.MustCompile(`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`)

// Role is an organization-owned scope group, or an immutable system template.
// Administrator capability is reserved to the built-in administrator slug.
type Role struct {
	Slug            string   `json:"slug"`
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	Permissions     []string `json:"permissions" nullable:"false"`
	BuiltIn         bool     `json:"builtIn"`
	IsAdministrator bool     `json:"isAdministrator"`
}

type RoleDefinition struct {
	Name        string   `json:"name" minLength:"1" maxLength:"200"`
	Description string   `json:"description" maxLength:"1000"`
	Permissions []string `json:"permissions" nullable:"false"`
}

type CreateRole struct {
	Slug string `json:"slug" minLength:"1" maxLength:"64" pattern:"^[a-z][a-z0-9]*(-[a-z0-9]+)*$"`
	RoleDefinition
}

func ValidRoleSlug(slug string) bool { return len(slug) <= 64 && roleSlug.MatchString(slug) }

func (r RoleDefinition) Validate() error {
	if strings.TrimSpace(r.Name) == "" || utf8.RuneCountInString(r.Name) > 200 || utf8.RuneCountInString(r.Description) > 1000 {
		return fmt.Errorf("a role name (1-200 characters) and description (up to 1000 characters) are required")
	}
	return validatePermissions(r.Permissions)
}

func validatePermissions(permissions []string) error {
	for _, permission := range permissions {
		if !slices.Contains(scope.OrganizationScopes(), permission) {
			return fmt.Errorf("invalid organization permission: %q", permission)
		}
	}
	return nil
}

// RoleTemplates are not persisted or editable; their permission vocabulary tracks
// Core's known scopes. Custom roles never receive wildcard or system capability.
func RoleTemplates() []Role {
	viewer, editor := []string{}, []string{}
	for _, permission := range scope.OrganizationScopes() {
		if strings.HasPrefix(permission, "read:") {
			viewer = append(viewer, permission)
		}
		if strings.HasPrefix(permission, "write:") {
			editor = append(editor, permission)
		}
	}
	return []Role{
		{Slug: RoleAdministrator, Name: "Administrator", Description: "Full organization access and user/role administration", Permissions: []string{scope.WriteAll()}, BuiltIn: true, IsAdministrator: true},
		{Slug: RoleViewer, Name: "Viewer", Description: "Read organization resources", Permissions: viewer, BuiltIn: true},
		{Slug: RoleEditor, Name: "Editor", Description: "Read and write organization resources", Permissions: editor, BuiltIn: true},
	}
}
