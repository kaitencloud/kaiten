package userauthorization_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/organization/ensuremembership"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/storage"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/management"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
)

func TestScopedHumanManagement(t *testing.T) {
	database, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(database.TearDown)
	unit := uow.NewUnitOfWork(database.DbPool)
	provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: unit, Membership: ensuremembership.NewUseCase(unit)})
	store := storage.New(unit)
	manage := management.NewUseCase(unit)
	org := database.DefaultData.OrganizationID
	newHuman := func() uuid.UUID {
		t.Helper()
		id, err := provision.Execute(t.Context(), command(org))
		require.NoError(t, err)
		return id
	}
	admin, reader, manager, target, powerful := newHuman(), newHuman(), newHuman(), newHuman(), newHuman()
	role := func(slug string, permissions ...string) schema.CreateRole {
		return schema.CreateRole{Slug: slug, RoleDefinition: schema.RoleDefinition{Name: slug, Permissions: permissions}}
	}
	assign := func(id uuid.UUID, roles []string, permissions []string) {
		t.Helper()
		_, err := store.ReplaceAuthorization(t.Context(), org, admin, id, schema.UserAuthorization{Enabled: true, Roles: roles, Permissions: permissions})
		require.NoError(t, err)
	}
	_, err = store.CreateRole(t.Context(), org, admin, role("user-reader", scope.Read(scope.Users)))
	require.NoError(t, err)
	_, err = store.CreateRole(t.Context(), org, admin, role("user-manager", scope.Write(scope.Users), scope.Read(scope.Customers)))
	require.NoError(t, err)
	assign(reader, []string{"user-reader"}, nil)
	assign(manager, []string{"user-manager"}, nil)

	_, err = manage.List(t.Context(), org, reader, 20, nil)
	require.NoError(t, err)
	_, err = manage.Get(t.Context(), org, reader, target)
	require.NoError(t, err)
	_, err = manage.ListRoles(t.Context(), org, reader)
	require.NoError(t, err)
	_, err = manage.CreateRole(t.Context(), org, reader, role("reader-cannot-write"))
	require.Equal(t, "Users.MissingPermission", apierrors.GetCode(err))
	_, err = manage.Me(t.Context(), org, target)
	require.NoError(t, err, "unassigned enabled humans can still see /me vocabulary")

	limited, err := manage.CreateRole(t.Context(), org, manager, role("customer-reader", scope.Read(scope.Customers)))
	require.NoError(t, err)
	assignment, err := manage.SetAssignments(t.Context(), org, manager, target, schema.UserRoleAssignments{Roles: []string{limited.Slug}})
	require.NoError(t, err)
	require.True(t, assignment.Enabled)
	for _, proposed := range []schema.UserRoleAssignments{
		{Roles: []string{schema.RoleAdministrator}},
		{Roles: []string{schema.RoleEditor}},
		{Permissions: []string{scope.Write(scope.Customers)}},
		{Permissions: []string{scope.Read(scope.Licenses)}},
	} {
		_, err = manage.SetAssignments(t.Context(), org, manager, target, proposed)
		require.Equal(t, "Users.CannotDelegate", apierrors.GetCode(err))
	}
	_, err = manage.CreateRole(t.Context(), org, manager, role("too-broad", scope.Write(scope.Customers)))
	require.Equal(t, "Users.CannotDelegate", apierrors.GetCode(err))
	_, err = manage.UpdateRole(t.Context(), org, manager, limited.Slug, schema.RoleDefinition{Name: "Customer reader", Permissions: []string{scope.Read(scope.Customers)}})
	require.NoError(t, err)
	err = manage.Update(t.Context(), org, manager, target, schema.Profile{Name: "Managed", Email: "scope-policy@example.com"})
	require.NoError(t, err)
	_, err = manage.SetEnabled(t.Context(), org, manager, target, false)
	require.NoError(t, err)
	assignment, err = manage.SetEnabled(t.Context(), org, manager, target, true)
	require.NoError(t, err)
	require.Equal(t, []string{limited.Slug}, assignment.Roles)

	// A broad role cannot be shrunk, renamed, retained or deleted by a lesser
	// manager, including when unassigned (so RoleInUse cannot mask attenuation).
	_, err = store.CreateRole(t.Context(), org, admin, role("broad", scope.Write(scope.Licenses)))
	require.NoError(t, err)
	for _, definition := range []schema.RoleDefinition{
		{Name: "Shrink", Permissions: []string{}},
		{Name: "Retain", Permissions: []string{scope.Write(scope.Licenses)}},
	} {
		_, err = manage.UpdateRole(t.Context(), org, manager, "broad", definition)
		require.Equal(t, "Users.CannotDelegate", apierrors.GetCode(err))
	}
	require.Equal(t, "Users.CannotDelegate", apierrors.GetCode(manage.DeleteRole(t.Context(), org, manager, "broad")))

	for _, authority := range []schema.UserRoleAssignments{
		{Roles: []string{schema.RoleAdministrator}},
		{Roles: []string{"broad"}},
		{Permissions: []string{scope.Write(scope.Licenses)}},
	} {
		assign(powerful, authority.Roles, authority.Permissions)
		for _, enabled := range []bool{true, false} {
			_, err = store.SetEnabled(t.Context(), org, admin, powerful, enabled)
			require.NoError(t, err)
			_, err = manage.Replace(t.Context(), org, manager, powerful, schema.UserAuthorization{Enabled: true})
			require.Equal(t, "Users.CannotDelegate", apierrors.GetCode(err))
			_, err = manage.SetAssignments(t.Context(), org, manager, powerful, schema.UserRoleAssignments{})
			require.Equal(t, "Users.CannotDelegate", apierrors.GetCode(err))
			for _, desired := range []bool{true, false} {
				_, err = manage.SetEnabled(t.Context(), org, manager, powerful, desired)
				require.Equal(t, "Users.CannotDelegate", apierrors.GetCode(err))
			}
			err = manage.Update(t.Context(), org, manager, powerful, schema.Profile{Name: "Forbidden", Email: "forbidden@example.com"})
			require.Equal(t, "Users.CannotDelegate", apierrors.GetCode(err))
		}
	}

	// Shared low roles do not permit modifying stronger assignees indirectly,
	// including disabled humans whose retained assignments would be restored.
	assign(powerful, []string{limited.Slug, schema.RoleAdministrator}, nil)
	for _, enabled := range []bool{true, false} {
		_, err = store.SetEnabled(t.Context(), org, admin, powerful, enabled)
		require.NoError(t, err)
		_, err = manage.UpdateRole(t.Context(), org, manager, limited.Slug, schema.RoleDefinition{Name: "Cannot indirectly edit admin", Permissions: []string{scope.Read(scope.Customers)}})
		require.Equal(t, "Users.CannotDelegate", apierrors.GetCode(err))
	}
	_, err = store.ReplaceAuthorization(t.Context(), org, admin, powerful, schema.UserAuthorization{Enabled: true})
	require.NoError(t, err)

	// Built-in editor is assignable by someone covering all its explicit grants,
	// but even every explicit permission does not stand in for admin write:*.
	assign(manager, nil, scope.OrganizationScopes())
	_, err = manage.SetAssignments(t.Context(), org, manager, target, schema.UserRoleAssignments{Roles: []string{schema.RoleEditor}})
	require.NoError(t, err)
	_, err = manage.SetAssignments(t.Context(), org, manager, target, schema.UserRoleAssignments{Roles: []string{schema.RoleAdministrator}})
	require.Equal(t, "Users.CannotDelegate", apierrors.GetCode(err))

	// Restore a narrow assignment, warm the gate, then revoke its custom role.
	assign(manager, []string{"user-manager"}, nil)
	_, err = manage.ListRoles(t.Context(), org, manager)
	require.NoError(t, err)
	_, err = store.UpdateRole(t.Context(), org, admin, "user-manager", schema.RoleDefinition{Name: "Revoked", Permissions: []string{scope.Read(scope.Customers)}})
	require.NoError(t, err)
	_, err = manage.ListRoles(t.Context(), org, manager)
	require.Equal(t, "Users.MissingPermission", apierrors.GetCode(err))
	_, err = manage.CreateRole(t.Context(), org, manager, role("revoked-cannot-create"))
	require.Equal(t, "Users.MissingPermission", apierrors.GetCode(err))
}

func TestWaitingManagerRechecksRevokedRole(t *testing.T) {
	database, err := tests.NewTestDatabase()
	require.NoError(t, err)
	t.Cleanup(database.TearDown)
	unit := uow.NewUnitOfWork(database.DbPool)
	provision := ensureuser.NewUseCase(ensureuser.Deps{Uof: unit, Membership: ensuremembership.NewUseCase(unit)})
	store := storage.New(unit)
	org := database.DefaultData.OrganizationID
	admin, err := provision.Execute(t.Context(), command(org))
	require.NoError(t, err)
	manager, err := provision.Execute(t.Context(), command(org))
	require.NoError(t, err)
	_, err = store.CreateRole(t.Context(), org, admin, schema.CreateRole{Slug: "manager", RoleDefinition: schema.RoleDefinition{Name: "Manager", Permissions: []string{scope.Write(scope.Users)}}})
	require.NoError(t, err)
	_, err = store.ReplaceAuthorization(t.Context(), org, admin, manager, schema.UserAuthorization{Enabled: true, Roles: []string{"manager"}})
	require.NoError(t, err)
	_, err = store.RequirePermission(t.Context(), org, manager, scope.Write(scope.Users))
	require.NoError(t, err)

	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	tx, err := database.DbPool.Begin(ctx)
	require.NoError(t, err)
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	_, err = tx.Exec(ctx, `SELECT id FROM organization WHERE id=$1 FOR NO KEY UPDATE`, org)
	require.NoError(t, err)
	_, err = tx.Exec(ctx, `UPDATE user_organization_role SET permissions='{}' WHERE organization_id=$1 AND slug='manager'`, org)
	require.NoError(t, err)
	result := make(chan error, 1)
	go func() {
		_, err := store.CreateRole(ctx, org, manager, schema.CreateRole{Slug: "must-not-create", RoleDefinition: schema.RoleDefinition{Name: "Blocked", Permissions: []string{}}})
		result <- err
	}()
	// Wait for PostgreSQL to prove that the management statement is blocked,
	// rather than relying on scheduler timing or a sleep before revocation.
	require.Eventually(t, func() bool {
		var waiting bool
		err := database.DbPool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR NO KEY UPDATE%')`).Scan(&waiting)
		return err == nil && waiting
	}, 5*time.Second, 10*time.Millisecond)
	require.NoError(t, tx.Commit(ctx))
	require.ErrorIs(t, <-result, storage.ErrMissingPermission)
}
