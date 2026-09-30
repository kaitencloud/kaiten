package main

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/spf13/cobra"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/pkg/externalid"
)

// The destructive commands. Every one of them runs the same use case as a Platform
// API operation, reached in-process instead of over HTTP, so these tests are about
// the two things the HTTP surface cannot give an operator: that the confirmation is
// mandatory, and that the invariants protecting system:kaiten hold on this entry
// point too -- they are enforced by database triggers, and a second entry point is
// exactly where a belt-without-braces implementation would show.
//
// What the use cases enforce beyond the triggers -- the entitlement decrement, the
// cache evictions -- is asserted where it is defined, against the use case itself,
// not restated per driver. Note that none of it is observable from here anyway:
// these three deletes emit no outbox event, and the decrement goes to the noop usage
// reporter openApplication constructs, so there is no effect left that would
// distinguish a use case from the statement it runs. That these commands reach one is
// held by the compiler and by tests/architecture, plus the one command where the
// difference does show -- `service-token mint`, whose issuance event is asserted in
// commands_test.go.

func TestDeleteCommandsRefuseWithoutConfirmation(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString
	organizationExternalID := ensureOrganizationForTest(t, dsn)

	for name, args := range map[string][]string{
		"organization": {"organization", "delete", "--external-id", organizationExternalID},
		"user":         {"user", "delete", "--external-id", platformidentity.ExternalID},
		"membership": {
			"organization", "membership", "delete",
			"--org", organizationExternalID, "--user", platformidentity.ExternalID,
		},
	} {
		t.Run(name, func(t *testing.T) {
			result := runAdminTools(t, dsn, args...)

			require.ErrorContains(t, result.Err, "--yes")
			require.Empty(t, result.Stdout)
		})
	}

	// Nothing was deleted by any of the refusals above.
	require.True(t, organizationExists(t, organizationExternalID))
}

// TestUserDeleteRefusesThePlatformIdentity is the trigger, reached through the CLI.
// The rule lives in the database precisely so a second entry point cannot forget
// it, and this is the second entry point.
func TestUserDeleteRefusesThePlatformIdentity(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString

	result := runAdminTools(t, dsn, "user", "delete",
		"--external-id", platformidentity.ExternalID, "--yes")

	require.ErrorContains(t, result.Err, "system:kaiten")
	require.ErrorContains(t, result.Err, "cannot be deleted")

	var deletedAt *string
	require.NoError(t, requireTestDB(t).DbPool.QueryRow(context.Background(),
		`SELECT deleted_at::text FROM "user" WHERE id = $1`, platformidentity.ID).Scan(&deletedAt))
	require.Nil(t, deletedAt, "the platform identity was soft-deleted")
}

// TestMembershipDeleteRefusesThePlatformIdentity is the other half: the platform
// identity's membership can only go by deleting the organization, because the mint
// resolves an existing membership and never creates one.
func TestMembershipDeleteRefusesThePlatformIdentity(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString
	organizationExternalID := ensureOrganizationForTest(t, dsn)

	result := runAdminTools(t, dsn, "organization", "membership", "delete",
		"--org", organizationExternalID, "--user", platformidentity.ExternalID, "--yes")

	require.ErrorContains(t, result.Err, "cannot be removed")
	require.ErrorContains(t, result.Err, "delete the organization instead")

	require.Equal(t, 1, countActiveMemberships(t, organizationExternalID, platformidentity.ID),
		"the platform identity's membership was removed")
}

// TestOrganizationDeleteTakesTheTenantAndItsSystemMembership is the one permitted
// way for that membership to go: through the foreign key's ON DELETE CASCADE.
func TestOrganizationDeleteTakesTheTenantAndItsSystemMembership(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString
	organizationExternalID := ensureOrganizationForTest(t, dsn)

	require.Equal(t, 1, countActiveMemberships(t, organizationExternalID, platformidentity.ID),
		"the organization trigger did not grant the platform membership")

	result := runAdminTools(t, dsn, "organization", "delete",
		"--external-id", organizationExternalID, "--yes")

	require.NoError(t, result.Err)
	require.Contains(t, result.Stdout, organizationExternalID)
	require.False(t, organizationExists(t, organizationExternalID))
	require.Zero(t, countActiveMemberships(t, organizationExternalID, platformidentity.ID))
}

func TestDeleteCommandsReportAnUnknownTarget(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString

	organization := runAdminTools(t, dsn, "organization", "delete",
		"--external-id", "org_never_existed", "--yes")
	require.ErrorContains(t, organization.Err, `organization "org_never_existed" does not exist`)

	user := runAdminTools(t, dsn, "user", "delete",
		"--external-id", "user_never_existed", "--yes")
	require.ErrorContains(t, user.Err, `user "user_never_existed" does not exist`)
}

// TestScopeCompletionOffersOnlyValidScopes pins the reason completion exists here:
// the candidates come from pkg/scope, the same closed set the API validates
// against, so a completed value cannot be one the server rejects. A hand-kept list
// would have been a second copy of that set, and the copy is what drifts.
func TestScopeCompletionOffersOnlyValidScopes(t *testing.T) {
	completions, directive := completeScopes(&cobra.Command{}, nil, "read:cus")

	require.Equal(t, []cobra.Completion{"read:customers"}, completions)
	require.NotZero(t, directive&cobra.ShellCompDirectiveNoSpace,
		"a comma-separated value must not have a space appended after each element")
	require.NotZero(t, directive&cobra.ShellCompDirectiveNoFileComp)
}

// TestScopeCompletionCompletesTheLastCSVElement is the property that makes the
// completer usable at all: --scopes takes a list, so completing the whole value as
// one token would replace everything already typed.
func TestScopeCompletionCompletesTheLastCSVElement(t *testing.T) {
	completions, _ := completeScopes(&cobra.Command{}, nil, "read:customers,write:tok")

	require.Equal(t, []cobra.Completion{"read:customers,write:tokens"}, completions)
}

// TestScopeCompletionSkipsWhatIsAlreadyChosen: offering a scope the value already
// carries would complete straight into a duplicate.
func TestScopeCompletionSkipsWhatIsAlreadyChosen(t *testing.T) {
	completions, _ := completeScopes(&cobra.Command{}, nil, "read:customers,read:cus")

	require.Empty(t, completions)
}

// TestCompletersAreSilentWithoutAUsableDatabase is the one property a completer
// must have that an ordinary command must not: it runs on a keystroke, so an
// unreachable database has to produce no suggestions rather than an error message
// pasted into the middle of the line being typed.
func TestCompletersAreSilentWithoutAUsableDatabase(t *testing.T) {
	t.Setenv("KAITEN_DATABASE_CONNECTION_STRING", "")

	command := &cobra.Command{}
	command.SetContext(context.Background())

	for name, complete := range map[string]completer{
		"organizations":        completeOrganizationExternalIDs,
		"users":                completeUserExternalIDs,
		"platform-token names": completeActivePlatformTokenNames,
	} {
		t.Run(name, func(t *testing.T) {
			completions, directive := complete(command, nil, "")

			require.Empty(t, completions)
			require.Equal(t, cobra.ShellCompDirectiveNoFileComp, directive)
		})
	}
}

// ensureOrganizationForTest creates a throwaway tenant through the CLI, which is
// also what gives it system:kaiten's membership -- the AFTER INSERT trigger on
// `organization` does that, and every test above depends on it having happened.
func ensureOrganizationForTest(t *testing.T, dsn string) string {
	t.Helper()

	externalID := "org_delete_" + uuid.NewString()[:8]
	require.NoError(t, runAdminTools(t, dsn, "organization", "ensure",
		"--external-id", externalID, "--name", "Delete Me").Err)

	return externalID
}

func organizationExists(t *testing.T, externalID string) bool {
	t.Helper()

	var exists bool
	require.NoError(t, requireTestDB(t).DbPool.QueryRow(context.Background(),
		`SELECT EXISTS (SELECT 1 FROM organization WHERE external_id = $1)`, externalID).Scan(&exists))

	return exists
}

func countActiveMemberships(t *testing.T, organizationExternalID string, userID uuid.UUID) int {
	t.Helper()

	var count int
	require.NoError(t, requireTestDB(t).DbPool.QueryRow(context.Background(),
		`SELECT count(*) FROM user_on_organization
		 WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
		externalid.DeriveOrganizationID(organizationExternalID), userID).Scan(&count))

	return count
}
