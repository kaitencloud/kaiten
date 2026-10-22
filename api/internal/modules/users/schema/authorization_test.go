package schema

import (
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
	require.Error(t, (UserAuthorization{Roles: []string{"admin"}}).Validate())
	for _, role := range []string{RoleViewer, RoleEditor} {
		assignment := UserAuthorization{Enabled: true, Roles: []string{role}}
		require.False(t, assignment.IsAdministrator())
		require.True(t, scope.HasScope(assignment.EffectiveScopes(), scope.Read(scope.Licenses)))
		require.Equal(t, role == RoleEditor, scope.HasScope(assignment.EffectiveScopes(), scope.Write(scope.Licenses)))
	}
	explicit := UserAuthorization{Enabled: true, Permissions: scope.OrganizationScopes()}
	require.NoError(t, explicit.Validate())
	require.False(t, explicit.IsAdministrator(), "no explicit permission grants administrator management")
}
