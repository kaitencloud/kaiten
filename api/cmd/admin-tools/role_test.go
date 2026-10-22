package main

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
)

func TestRoleValidationWithoutDatabase(t *testing.T) {
	context := []string{"--organization-external-id", "org", "--actor-external-id", "admin"}
	for name, tc := range map[string]struct {
		args []string
		err  string
	}{
		"list context":           {[]string{"role", "list"}, "exactly one"},
		"create explicit fields": {append([]string{"role", "create", "--slug", "support", "--name", "Support", "--permissions", "read:users", "--yes"}, context...), "must all be explicit"},
		"create confirmation":    {append([]string{"role", "create", "--slug", "support", "--name", "Support", "--description", "", "--permissions", "read:users"}, context...), "--yes"},
		"update confirmation":    {append([]string{"role", "update", "--slug", "support", "--name", "Support", "--description", "", "--scopes", ""}, context...), "--yes"},
		"update wildcard":        {append([]string{"role", "update", "--slug", "support", "--name", "Support", "--description", "", "--scopes", "write:*", "--yes"}, context...), "invalid organization permission"},
		"delete target":          {append([]string{"role", "delete", "--yes"}, context...), "--slug"},
		"delete confirmation":    {append([]string{"roles", "delete", "--slug", "support"}, context...), "--yes"},
	} {
		t.Run(name, func(t *testing.T) {
			result := runAdminTools(t, "", tc.args...)
			require.ErrorContains(t, result.Err, tc.err)
			require.Empty(t, result.Stdout)
		})
	}
}

func TestRoleCLI(t *testing.T) {
	t.Setenv("KAITEN_METERED_ENABLED", "false")
	testDB := requireTestDB(t)
	dsn := testDB.ConnectionString
	orgExternalID := ensureOrganizationForTest(t, dsn)
	t.Setenv("KAITEN_DATABASE_CONNECTION_STRING", dsn)
	app, cleanup, err := openApplication(t.Context())
	require.NoError(t, err)
	defer cleanup()
	orgID, err := resolveOrganizationID(t.Context(), app, orgExternalID)
	require.NoError(t, err)
	provision := func() (string, uuid.UUID) {
		t.Helper()
		subject := "cli-role-user-" + uuid.NewString()
		id, err := app.InProcess().EnsureUser(t.Context(), &ensureuser.Command{
			Subject: subject, Name: "Role CLI Human", Email: subject + "@example.com", OrganizationID: orgID,
		})
		require.NoError(t, err)
		return subject, id
	}
	actor, actorID := provision()
	member, _ := provision()
	// Isolated fixture setup, not a command or implicit operator recovery path.
	_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_organization_authorization(organization_id,user_id,roles) VALUES ($1,$2,ARRAY['administrator']::text[]) ON CONFLICT(organization_id,user_id) DO UPDATE SET roles=EXCLUDED.roles`, orgID, actorID)
	require.NoError(t, err)
	args := func(command string, extra ...string) []string {
		return append([]string{"role", command, "--organization-external-id", orgExternalID, "--actor-external-id", actor}, extra...)
	}

	result := runAdminTools(t, dsn, args("list", "--json")...)
	require.NoError(t, result.Err)
	var roles []schema.Role
	require.NoError(t, json.Unmarshal([]byte(result.Stdout), &roles))
	var administrator schema.Role
	for _, role := range roles {
		if role.Slug == "administrator" {
			administrator = role
		}
	}
	require.True(t, administrator.BuiltIn)
	require.True(t, administrator.IsAdministrator)
	result = runAdminTools(t, dsn, args("list")...)
	require.NoError(t, result.Err)
	require.Contains(t, result.Stdout, "ADMINISTRATOR")

	result = runAdminTools(t, dsn, args("create", "--slug", "support", "--name", "Support", "--description", "Support staff", "--scopes", "read:users,write:customers", "--yes", "--json")...)
	require.NoError(t, result.Err)
	var role schema.Role
	require.NoError(t, json.Unmarshal([]byte(result.Stdout), &role))
	require.Equal(t, "support", role.Slug)
	require.False(t, role.BuiltIn)
	require.False(t, role.IsAdministrator)
	result = runAdminTools(t, dsn, "user", "grant", "--organization-external-id", orgExternalID, "--actor-external-id", actor, "--external-id", member, "--roles", "support", "--permissions", "", "--enabled", "--yes")
	require.NoError(t, result.Err)
	result = runAdminTools(t, dsn, "role", "list", "--organization-external-id", orgExternalID, "--actor-external-id", member)
	require.NoError(t, result.Err, "custom role read:users allows role directory access")
	result = runAdminTools(t, dsn, args("delete", "--slug", "support", "--yes")...)
	require.Error(t, result.Err, "assigned role deletion must be refused")
	require.Empty(t, result.Stdout)
	result = runAdminTools(t, dsn, args("update", "--slug", "support", "--name", "Support limited", "--description", "", "--permissions", "read:customers", "--yes", "--json")...)
	require.NoError(t, result.Err)
	require.NoError(t, json.Unmarshal([]byte(result.Stdout), &role))
	require.Equal(t, "Support limited", role.Name)
	require.Equal(t, []string{"read:customers"}, role.Permissions)

	for _, command := range []string{"update", "delete"} {
		extra := []string{"--slug", "administrator", "--yes"}
		if command == "update" {
			extra = append(extra, "--name", "Edited", "--description", "", "--permissions", "")
		}
		result = runAdminTools(t, dsn, args(command, extra...)...)
		require.Error(t, result.Err, "built-in administrator must be immutable")
		require.Empty(t, result.Stdout)
	}
	for _, command := range [][]string{
		{"list"},
		{"create", "--slug", "unauthorized", "--name", "Unauthorized", "--description", "", "--permissions", "", "--yes"},
		{"update", "--slug", "support", "--name", "Unauthorized", "--description", "", "--permissions", "", "--yes"},
		{"delete", "--slug", "support", "--yes"},
	} {
		result = runAdminTools(t, dsn, append([]string{"role", "--organization-external-id", orgExternalID, "--actor-external-id", member}, command...)...)
		require.ErrorContains(t, result.Err, "stored user-management permission")
		require.Empty(t, result.Stdout)
	}
	otherOrg := ensureOrganizationForTest(t, dsn)
	result = runAdminTools(t, dsn, "role", "list", "--organization-external-id", otherOrg, "--actor-external-id", actor)
	require.ErrorContains(t, result.Err, "stored user-management permission")
	require.Empty(t, result.Stdout)
	result = runAdminTools(t, dsn, "user", "authorization", "--organization-external-id", orgExternalID, "--actor-external-id", actor, "--external-id", member, "--roles", "", "--permissions", "", "--enabled", "--yes")
	require.NoError(t, result.Err)
	result = runAdminTools(t, dsn, args("delete", "--slug", "support", "--yes", "--json")...)
	require.NoError(t, result.Err)
	require.JSONEq(t, `{"slug":"support","deleted":true}`, result.Stdout)
}
