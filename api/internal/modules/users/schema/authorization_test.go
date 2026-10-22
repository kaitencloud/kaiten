package schema

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/pkg/scope"
)

func TestAuthorization(t *testing.T) {
	require.Equal(t, []string{scope.Read(scope.Profile)}, (UserAuthorization{Enabled: true}).EffectiveScopes())
	admin := UserAuthorization{Enabled: true, Roles: []string{RoleAdministrator}}
	require.True(t, admin.IsAdministrator())
	require.Equal(t, []string{scope.WriteAll()}, admin.EffectiveScopes())
	admin.Enabled = false
	require.False(t, admin.IsAdministrator())
	require.Empty(t, admin.EffectiveScopes())
	for _, permission := range []string{"write:*", "delete:users", "not-a-scope", " write:licenses"} {
		require.Error(t, (UserAuthorization{Permissions: []string{permission}}).Validate())
	}
	require.NoError(t, (UserAuthorization{Roles: []string{"custom-role"}}).Validate())
	require.Empty(t, (UserAuthorization{Enabled: true, Roles: []string{"unknown"}}).EffectiveScopes())
	for _, role := range []string{RoleViewer, RoleEditor} {
		assignment := UserAuthorization{Enabled: true, Roles: []string{role}}
		require.False(t, assignment.IsAdministrator())
		require.True(t, scope.HasScope(assignment.EffectiveScopes(), scope.Read(scope.Licenses)))
		require.Equal(t, role == RoleEditor, scope.HasScope(assignment.EffectiveScopes(), scope.Write(scope.Licenses)))
	}
	explicit := UserAuthorization{Enabled: true, Permissions: scope.OrganizationScopes()}
	require.NoError(t, explicit.Validate())
	require.False(t, explicit.IsAdministrator(), "explicit users permission is not administrator status")
}

func TestCustomRoleExpansion(t *testing.T) {
	role := Role{Slug: "custom", Name: "Custom", Permissions: []string{scope.Write(scope.Licenses), scope.Write(scope.Users)}}
	a := UserAuthorization{Enabled: true, Roles: []string{role.Slug}, Permissions: []string{scope.Read(scope.Components)}}
	require.Empty(t, a.EffectiveScopes())
	grants := a.EffectiveScopes(role)
	require.False(t, a.IsAdministrator())
	require.True(t, scope.HasScope(grants, scope.Read(scope.Licenses)))
	require.True(t, scope.HasScope(grants, scope.Read(scope.Components)))
	require.False(t, scope.HasScope(grants, scope.Write(scope.Components)))
	role.Permissions = []string{scope.WriteAll()}
	require.Empty(t, a.EffectiveScopes(role))
	role.Permissions = []string{scope.Write(scope.Users)}
	role.IsAdministrator = true
	require.Empty(t, a.EffectiveScopes(role))
	require.NoError(t, (RoleDefinition{Name: strings.Repeat("界", 200), Description: strings.Repeat("界", 1000)}).Validate())
	require.Error(t, (RoleDefinition{Name: strings.Repeat("界", 201)}).Validate())
}
