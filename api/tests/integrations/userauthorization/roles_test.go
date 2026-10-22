package userauthorization_test

import (
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensuremembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/storage"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
)

func TestCustomRolesStoredPolicy(t *testing.T) {
	testDB, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(testDB.TearDown)
	unit := uow.NewUnitOfWork(testDB.DbPool)
	provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: unit, Membership: ensuremembership.NewUseCase(unit)})
	store := storage.New(unit)
	org := testDB.DefaultData.OrganizationID
	admin, err := provision.Execute(t.Context(), command(org))
	require.NoError(t, err)
	member, err := provision.Execute(t.Context(), command(org))
	require.NoError(t, err)
	input := schema.CreateRole{Slug: "license-manager", RoleDefinition: schema.RoleDefinition{Name: "License manager", Permissions: []string{scope.Write(scope.Licenses), scope.Write(scope.Users)}}}
	role, err := store.CreateRole(t.Context(), org, admin, input)
	require.NoError(t, err)
	require.False(t, role.IsAdministrator)
	_, err = store.ReplaceAuthorization(t.Context(), org, admin, member, schema.UserAuthorization{Enabled: true, Roles: []string{role.Slug}})
	require.NoError(t, err)
	grants, err := store.ResolveGrants(t.Context(), org, member)
	require.NoError(t, err)
	require.True(t, scope.HasScope(grants, scope.Read(scope.Licenses)))
	_, err = store.ReplaceAuthorization(t.Context(), org, member, member, schema.UserAuthorization{Enabled: true, Roles: []string{schema.RoleAdministrator}})
	require.ErrorIs(t, err, storage.ErrAdministratorRequired)
	require.ErrorIs(t, store.DeleteRole(t.Context(), org, admin, role.Slug), storage.ErrRoleInUse)
	_, err = store.UpdateRole(t.Context(), org, admin, role.Slug, schema.RoleDefinition{Name: "License reader", Permissions: []string{scope.Read(scope.Licenses)}})
	require.NoError(t, err)
	grants, err = store.ResolveGrants(t.Context(), org, member)
	require.NoError(t, err)
	require.False(t, scope.HasScope(grants, scope.Write(scope.Licenses)))
	// Assignment validation resolves in this organization only.
	_, err = store.ReplaceAuthorization(t.Context(), org, admin, member, schema.UserAuthorization{Enabled: true, Roles: []string{"missing"}})
	require.ErrorIs(t, err, storage.ErrInvalidAuthorization)
	_, err = store.CreateRole(t.Context(), org, admin, schema.CreateRole{Slug: schema.RoleAdministrator, RoleDefinition: input.RoleDefinition})
	require.ErrorIs(t, err, storage.ErrBuiltInRole)
	_, err = store.UpdateRole(t.Context(), org, admin, schema.RoleAdministrator, input.RoleDefinition)
	require.ErrorIs(t, err, storage.ErrBuiltInRole)
	require.ErrorIs(t, store.DeleteRole(t.Context(), org, admin, schema.RoleAdministrator), storage.ErrBuiltInRole)
	_, err = store.UpdateRole(t.Context(), org, admin, role.Slug, schema.RoleDefinition{Name: "Invalid", Permissions: []string{scope.WriteAll()}})
	require.ErrorIs(t, err, storage.ErrInvalidAuthorization)
	assignment, err := store.SetEnabled(t.Context(), org, admin, member, false)
	require.NoError(t, err)
	require.Equal(t, []string{role.Slug}, assignment.Roles)
	require.ErrorIs(t, store.DeleteRole(t.Context(), org, admin, role.Slug), storage.ErrRoleInUse)
	_, err = store.SetEnabled(t.Context(), org, admin, member, true)
	require.NoError(t, err)
	_, err = store.SetEnabled(t.Context(), org, admin, admin, false)
	require.ErrorIs(t, err, storage.ErrLastAdministrator)
	_, err = store.ReplaceAuthorization(t.Context(), org, admin, member, schema.UserAuthorization{Enabled: true})
	require.NoError(t, err)
	require.NoError(t, store.DeleteRole(t.Context(), org, admin, role.Slug))
	// Out-of-band corruption does not silently grant profile or wildcard grants.
	_, err = testDB.DbPool.Exec(t.Context(), `UPDATE user_organization_authorization SET roles=ARRAY['unknown'] WHERE organization_id=$1 AND user_id=$2`, org, member)
	require.NoError(t, err)
	_, err = store.ResolveGrants(t.Context(), org, member)
	require.ErrorIs(t, err, storage.ErrInvalidAuthorization)
	// Race role deletion and assignment: the org lock means either assignment
	// succeeds + deletion conflicts, or deletion succeeds + assignment rejects.
	_, err = store.CreateRole(t.Context(), org, admin, schema.CreateRole{Slug: "race", RoleDefinition: schema.RoleDefinition{Name: "Race"}})
	require.NoError(t, err)
	start := make(chan struct{})
	var wg sync.WaitGroup
	var assignErr, deleteErr error
	wg.Go(func() {
		<-start
		_, assignErr = store.ReplaceAuthorization(t.Context(), org, admin, member, schema.UserAuthorization{Enabled: true, Roles: []string{"race"}})
	})
	wg.Go(func() { <-start; deleteErr = store.DeleteRole(t.Context(), org, admin, "race") })
	close(start)
	wg.Wait()
	if assignErr == nil {
		require.ErrorIs(t, deleteErr, storage.ErrRoleInUse)
	} else {
		require.NoError(t, deleteErr)
		require.ErrorIs(t, assignErr, storage.ErrInvalidAuthorization)
	}
	// A role with the same slug in another organization is never resolved here.
	otherOrg := uuid.New()
	_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO organization(id,external_id,name) VALUES ($1,$2,'Other');`, otherOrg, uuid.NewString())
	require.NoError(t, err)
	_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_organization_role(organization_id,slug,name,permissions) VALUES ($1,'other','Other',ARRAY['write:users'])`, otherOrg)
	require.NoError(t, err)
	_, err = store.ReplaceAuthorization(t.Context(), org, admin, member, schema.UserAuthorization{Enabled: true, Roles: []string{"other"}})
	require.ErrorIs(t, err, storage.ErrInvalidAuthorization)
}

func TestRoleEditsPreserveConcurrentDisablement(t *testing.T) {
	database, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(database.TearDown)
	unit := uow.NewUnitOfWork(database.DbPool)
	provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: unit, Membership: ensuremembership.NewUseCase(unit)})
	admin, err := provision.Execute(t.Context(), command(database.DefaultData.OrganizationID))
	require.NoError(t, err)
	member, err := provision.Execute(t.Context(), command(database.DefaultData.OrganizationID))
	require.NoError(t, err)
	store := storage.New(unit)
	// Administrator B disables after A has opened the role editor.
	_, err = store.SetEnabled(t.Context(), database.DefaultData.OrganizationID, admin, member, false)
	require.NoError(t, err)
	// A saves role/direct-scope state without sending cached enabled=true.
	result, err := store.SetAssignments(t.Context(), database.DefaultData.OrganizationID, admin, member, schema.UserRoleAssignments{Roles: []string{schema.RoleViewer}, Permissions: []string{}})
	require.NoError(t, err)
	require.False(t, result.Enabled)
	require.Equal(t, []string{schema.RoleViewer}, result.Roles)
}
