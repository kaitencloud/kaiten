package main

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/ensureuser"
	"github.com/kaitencloud/kaiten/api/internal/modules/users/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

func TestUserManagementValidationWithoutDatabase(t *testing.T) {
	context := []string{"--organization-external-id", "test-org", "--actor-external-id", "admin"}
	for name, tc := range map[string]struct {
		args []string
		err  string
	}{
		"missing organization":      {[]string{"user", "list", "--actor-external-id", "admin"}, "exactly one"},
		"ambiguous organization":    {append([]string{"user", "list", "--organization-id", uuid.NewString()}, context...), "exactly one"},
		"invalid organization":      {[]string{"user", "list", "--organization-id", "not-uuid", "--actor-external-id", "admin"}, "non-zero UUID"},
		"zero organization":         {[]string{"user", "list", "--organization-id", uuid.Nil.String(), "--actor-external-id", "admin"}, "non-zero UUID"},
		"missing actor":             {[]string{"user", "list", "--organization-external-id", "org"}, "--actor-external-id"},
		"missing target":            {append([]string{"user", "get"}, context...), "--external-id"},
		"missing profile":           {append([]string{"user", "update", "--external-id", "user"}, context...), "--name and --email"},
		"missing assignment fields": {append([]string{"user", "authorization", "--external-id", "user", "--roles", "viewer", "--yes"}, context...), "must all be explicit"},
		"enable confirmation":       {append([]string{"user", "enable", "--external-id", "user"}, context...), "--yes"},
		"disable confirmation":      {append([]string{"user", "disable", "--external-id", "user"}, context...), "--yes"},
		"missing confirmation":      {append([]string{"user", "grant", "--external-id", "user", "--roles", "viewer", "--scopes", "", "--enabled"}, context...), "--yes"},
		"wildcard permission":       {append([]string{"user", "authorization", "--external-id", "user", "--roles", "", "--permissions", "write:*", "--enabled", "--yes"}, context...), "invalid organization permission"},
		"platform permission":       {append([]string{"user", "authorization", "--external-id", "user", "--roles", "", "--permissions", "delete:memberships", "--enabled", "--yes"}, context...), "invalid organization permission"},
		"ambiguous permissions":     {append([]string{"user", "authorization", "--external-id", "user", "--roles", "viewer", "--permissions", "", "--scopes", "", "--enabled", "--yes"}, context...), "only one"},
		"invalid limit":             {append([]string{"user", "list", "--limit", "201"}, context...), "--limit must be"},
		"unexpected argument":       {append([]string{"user", "get", "unexpected"}, context...), "unknown command"},
	} {
		t.Run(name, func(t *testing.T) {
			result := runAdminTools(t, "", tc.args...)
			require.ErrorContains(t, result.Err, tc.err)
			require.Empty(t, result.Stdout)
		})
	}
}

func TestParseUserCSV(t *testing.T) {
	require.Equal(t, []string{}, parseUserCSV(" , "))
	require.Equal(t, []string{"viewer", "custom-support"}, parseUserCSV(" viewer, custom-support, viewer ,"))
	require.NoError(t, validateUserPermissions([]string{}))
	require.NoError(t, validateUserPermissions(parseUserCSV("read:users,write:customers")))
}

func TestUserManagementCLI(t *testing.T) {
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
		subject := "cli-user-" + uuid.NewString()
		id, err := app.InProcess().EnsureUser(t.Context(), &ensureuser.Command{
			Subject: subject, Name: "CLI Human", Email: subject + "@example.com", OrganizationID: orgID,
		})
		require.NoError(t, err)
		return subject, id
	}
	actor, actorID := provision()
	member, memberID := provision()
	// Deterministic isolated fixture: the deployment-wide bootstrap may already
	// have been consumed by another test in this package. No production driver
	// reaches this statement or grants itself an administrator role.
	_, err = testDB.DbPool.Exec(t.Context(), `INSERT INTO user_organization_authorization(organization_id,user_id,roles) VALUES ($1,$2,ARRAY['administrator']::text[]) ON CONFLICT(organization_id,user_id) DO UPDATE SET roles=EXCLUDED.roles`, orgID, actorID)
	require.NoError(t, err)
	args := func(command string, extra ...string) []string {
		return append([]string{"user", command, "--organization-external-id", orgExternalID, "--actor-external-id", actor}, extra...)
	}
	get := func(subject string) schema.ManagedUser {
		t.Helper()
		result := runAdminTools(t, dsn, args("get", "--external-id", subject, "--json")...)
		require.NoError(t, result.Err)
		var user schema.ManagedUser
		require.NoError(t, json.Unmarshal([]byte(result.Stdout), &user))
		return user
	}
	assignment := func(subject, roles, permissions string, enabled bool) commandResult {
		t.Helper()
		state := "--enabled=false"
		if enabled {
			state = "--enabled=true"
		}
		return runAdminTools(t, dsn, args("authorization", "--external-id", subject, "--roles", roles, "--permissions", permissions, state, "--yes", "--json")...)
	}

	t.Run("list pagination json and plain get", func(t *testing.T) {
		result := runAdminTools(t, dsn, args("list", "--limit", "1", "--json")...)
		require.NoError(t, result.Err)
		var page pagination.Page[schema.ManagedUser]
		require.NoError(t, json.Unmarshal([]byte(result.Stdout), &page))
		require.Len(t, page.Items, 1)
		require.True(t, page.HasMore)
		require.NotNil(t, page.NextCursor)
		first := page.Items[0].ID
		result = runAdminTools(t, dsn, args("list", "--cursor", *page.NextCursor, "--json")...)
		require.NoError(t, result.Err)
		require.NoError(t, json.Unmarshal([]byte(result.Stdout), &page))
		require.Len(t, page.Items, 1)
		require.NotEqual(t, first, page.Items[0].ID)
		require.False(t, page.HasMore)
		require.NoError(t, runAdminTools(t, dsn, args("list")...).Err)
		result = runAdminTools(t, dsn, args("get", "--external-id", member)...)
		require.NoError(t, result.Err)
		require.Contains(t, result.Stdout, "EXTERNAL_ID")
		require.Contains(t, result.Stdout, memberID.String())
		result = runAdminTools(t, dsn, "user", "get", "--organization-id", orgID.String(), "--actor-external-id", actor, "--external-id", member, "--json")
		require.NoError(t, result.Err)
		require.Equal(t, member, get(member).ExternalID)
	})

	t.Run("grant replacement clearing disabling reenabling", func(t *testing.T) {
		result := assignment(member, "viewer,viewer", "read:customers,read:customers", true)
		require.NoError(t, result.Err)
		var stored schema.UserAuthorization
		require.NoError(t, json.Unmarshal([]byte(result.Stdout), &stored))
		require.Equal(t, []string{"viewer"}, stored.Roles)
		require.Equal(t, []string{"read:customers"}, stored.Permissions)
		require.Equal(t, stored, get(member).Authorization)
		require.NoError(t, assignment(member, "editor", "write:users", false).Err)
		require.False(t, get(member).Authorization.Enabled)
		require.NoError(t, assignment(member, "", "", true).Err)
		actual := get(member).Authorization
		require.True(t, actual.Enabled)
		require.Empty(t, actual.Roles)
		require.Empty(t, actual.Permissions)
		result = assignment(member, "never-created-role", "", true)
		require.Error(t, result.Err)
		require.Empty(t, result.Stdout)
		require.Empty(t, get(member).Authorization.Roles)
	})

	t.Run("atomic enable and disable preserve assignments", func(t *testing.T) {
		require.NoError(t, assignment(member, "viewer", "write:customers", true).Err)
		for _, verb := range []string{"disable", "enable", "enable"} {
			result := runAdminTools(t, dsn, args(verb, "--external-id", member, "--yes", "--json")...)
			require.NoError(t, result.Err)
			actual := get(member).Authorization
			require.Equal(t, verb == "enable", actual.Enabled)
			require.Equal(t, []string{"viewer"}, actual.Roles)
			require.Equal(t, []string{"write:customers"}, actual.Permissions)
		}
		result := runAdminTools(t, dsn, args("disable", "--external-id", actor, "--yes")...)
		require.ErrorContains(t, result.Err, "last administrator")
		require.Empty(t, result.Stdout)
	})

	t.Run("confirmation and last administrator invariant", func(t *testing.T) {
		result := runAdminTools(t, dsn, args("authorization", "--external-id", actor, "--roles", "", "--permissions", "", "--enabled")...)
		require.ErrorContains(t, result.Err, "--yes")
		require.True(t, get(actor).Authorization.IsAdministrator())
		for _, enabled := range []bool{true, false} {
			result = assignment(actor, "", "", enabled)
			require.ErrorContains(t, result.Err, "last administrator")
			require.Empty(t, result.Stdout)
		}
		require.True(t, get(actor).Authorization.IsAdministrator())
	})

	t.Run("profile validation and managed persistence", func(t *testing.T) {
		result := runAdminTools(t, dsn, args("update", "--external-id", member, "--name", "Managed Human", "--email", "managed-"+uuid.NewString()+"@example.com", "--json")...)
		require.NoError(t, result.Err)
		require.JSONEq(t, `{"id":"`+memberID.String()+`","updated":true}`, result.Stdout)
		before := get(member)
		require.Equal(t, "Managed Human", before.Name)
		_, err = app.InProcess().EnsureUser(t.Context(), &ensureuser.Command{Subject: member, Name: "IdP overwrite", Email: member + "@example.com", OrganizationID: orgID})
		require.NoError(t, err)
		require.Equal(t, before.Name, get(member).Name)
		require.Equal(t, before.Email, get(member).Email)
		result = runAdminTools(t, dsn, args("update", "--external-id", member, "--name", "Invalid", "--email", "not-an-email")...)
		require.ErrorContains(t, result.Err, "valid email")
		require.Empty(t, result.Stdout)
		require.Equal(t, "Managed Human", get(member).Name)
	})

	t.Run("stored policy denies static scopes missing and disabled actors", func(t *testing.T) {
		require.NoError(t, assignment(member, "viewer", "write:users", true).Err)
		for _, command := range [][]string{{"list"}, {"get", "--external-id", actor}} {
			result := runAdminTools(t, dsn, append([]string{"user", "--organization-external-id", orgExternalID, "--actor-external-id", member}, command...)...)
			require.NoError(t, result.Err)
		}
		for _, command := range [][]string{
			{"update", "--external-id", actor, "--name", "Unauthorized", "--email", "unauthorized@example.com"},
			{"grant", "--external-id", member, "--roles", "administrator", "--scopes", "", "--enabled", "--yes"},
		} {
			result := runAdminTools(t, dsn, append([]string{"user", "--organization-external-id", orgExternalID, "--actor-external-id", member}, command...)...)
			require.ErrorContains(t, result.Err, "permissions not held")
			require.Empty(t, result.Stdout)
		}
		disabled, _ := provision()
		require.NoError(t, assignment(disabled, "administrator", "", true).Err)
		require.NoError(t, assignment(disabled, "administrator", "", false).Err)
		for _, subject := range []string{disabled, platformidentity.ExternalID, "no-such-actor"} {
			result := runAdminTools(t, dsn, "user", "list", "--organization-id", orgID.String(), "--actor-external-id", subject)
			require.Error(t, result.Err)
			require.Empty(t, result.Stdout)
		}
	})

	t.Run("tenant isolation invalid cursor and unknown targets", func(t *testing.T) {
		otherOrg := ensureOrganizationForTest(t, dsn)
		result := runAdminTools(t, dsn, "user", "get", "--organization-external-id", otherOrg, "--actor-external-id", actor, "--external-id", member)
		require.ErrorContains(t, result.Err, "stored user-management permission")
		require.Empty(t, result.Stdout)
		result = runAdminTools(t, dsn, args("get", "--external-id", "no-such-user")...)
		require.ErrorContains(t, result.Err, "does not exist")
		result = runAdminTools(t, dsn, args("get", "--external-id", platformidentity.ExternalID)...)
		require.ErrorContains(t, result.Err, "not found")
		result = runAdminTools(t, dsn, args("list", "--cursor", "invalid")...)
		require.ErrorContains(t, result.Err, "cursor")
	})
}
