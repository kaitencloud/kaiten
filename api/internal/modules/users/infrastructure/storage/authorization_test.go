package storage

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

func TestAssignmentAuthority(t *testing.T) {
	manager := []string{scope.Read(scope.Profile), scope.Write(scope.Users), scope.Write(scope.Customers)}
	roles := append(schema.RoleTemplates(), schema.Role{Slug: "customer-reader", Name: "Customer reader", Permissions: []string{scope.Read(scope.Customers)}})
	for name, tc := range map[string]struct {
		grants     []string
		assignment schema.UserAuthorization
		err        error
	}{
		"write implies read":                    {manager, schema.UserAuthorization{Enabled: true, Roles: []string{"customer-reader"}}, nil},
		"disabled retains boundary":             {manager, schema.UserAuthorization{Enabled: false, Permissions: []string{scope.Write(scope.Licenses)}}, ErrCannotDelegate},
		"broader role":                          {manager, schema.UserAuthorization{Enabled: true, Roles: []string{schema.RoleEditor}}, ErrCannotDelegate},
		"administrator needs wildcard":          {scope.OrganizationScopes(), schema.UserAuthorization{Enabled: true, Roles: []string{schema.RoleAdministrator}}, ErrCannotDelegate},
		"disabled administrator needs wildcard": {manager, schema.UserAuthorization{Enabled: false, Roles: []string{schema.RoleAdministrator}}, ErrCannotDelegate},
		"administrator can delegate":            {[]string{scope.WriteAll()}, schema.UserAuthorization{Enabled: true, Roles: []string{schema.RoleAdministrator}}, nil},
		"unknown assignment fails closed":       {[]string{scope.WriteAll()}, schema.UserAuthorization{Enabled: true, Roles: []string{"missing"}}, ErrInvalidAuthorization},
	} {
		t.Run(name, func(t *testing.T) {
			require.ErrorIs(t, requireAssignmentAuthority(tc.grants, tc.assignment, roles), tc.err)
		})
	}
}
