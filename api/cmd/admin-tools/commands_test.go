package main

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/kaiten"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createplatformtoken"
	identityevents "github.com/kaitencloud/kaiten/api/internal/modules/identity/events"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	"github.com/kaitencloud/kaiten/api/pkg/externalid"
	"github.com/kaitencloud/kaiten/api/pkg/secretfile"
	"github.com/kaitencloud/kaiten/api/tests"
)

// The database is created on first use rather than in TestMain, so the
// credential unit tests in this package still run on a machine without a Docker
// socket. TestMain only has to tear down what was actually started.
var (
	testDBOnce sync.Once
	testDB     *tests.TestDatabase
	testDBErr  error
)

func TestMain(m *testing.M) {
	code := m.Run()
	if testDB != nil {
		testDB.TearDown()
	}
	os.Exit(code)
}

func requireTestDB(t *testing.T) *tests.TestDatabase {
	t.Helper()

	testDBOnce.Do(func() { testDB, testDBErr = tests.NewTestDatabase() })
	require.NoError(t, testDBErr)

	return testDB
}

// commandResult is what a command left behind on each of its channels. Logs is
// where every leakage assertion looks: it merges slog's output with the
// command's own stderr, which together are everything this binary writes that
// is not the payload on stdout.
type commandResult struct {
	Stdout string
	Logs   string
	Err    error
}

// runAdminTools executes the real command tree with its own streams, the way an
// operator would invoke the binary.
func runAdminTools(t *testing.T, dsn string, args ...string) commandResult {
	t.Helper()

	t.Setenv("KAITEN_DATABASE_CONNECTION_STRING", dsn)

	var stdout, stderr, logs bytes.Buffer

	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	defer slog.SetDefault(previousLogger)

	root := newRootCommand()
	root.SetOut(&stdout)
	root.SetErr(&stderr)
	root.SetArgs(args)

	err := root.ExecuteContext(context.Background())

	return commandResult{Stdout: stdout.String(), Logs: logs.String() + stderr.String(), Err: err}
}

// emittedCredential asserts the stdout contract - exactly the credential and a
// newline, nothing else - and that nothing on any other channel echoed it.
func emittedCredential(t *testing.T, result commandResult, prefix string) string {
	t.Helper()

	require.NoError(t, result.Err)

	plaintext := strings.TrimSuffix(result.Stdout, "\n")
	require.Equal(t, plaintext+"\n", result.Stdout,
		"stdout must carry the credential and nothing else, or $(...) capture yields an unusable value")
	require.True(t, strings.HasPrefix(plaintext, prefix),
		"expected a credential prefixed %q, got one prefixed %q", prefix, plaintext[:min(len(plaintext), 4)])
	require.NotContains(t, result.Logs, plaintext, "a credential must never reach a log line")

	return plaintext
}

type tokenRow struct {
	ID                      uuid.UUID
	Kind                    string
	Hash                    string
	Name                    string
	Scopes                  []string
	OrganizationID          *uuid.UUID
	ServiceAccountID        uuid.UUID
	IssuedByPlatformTokenID *uuid.UUID
	ExpiresAt               *time.Time
	RevokedDate             *time.Time
}

func fetchToken(t *testing.T, plaintext string) tokenRow {
	t.Helper()

	var row tokenRow
	err := requireTestDB(t).DbPool.QueryRow(context.Background(), `
		SELECT id, kind::text, hash, name, scopes, organization_id, service_account_id,
		       issued_by_platform_token_id, expires_at, revoked_date
		FROM token WHERE lookup_hash = $1`, token.LookupHash(plaintext)).
		Scan(&row.ID, &row.Kind, &row.Hash, &row.Name, &row.Scopes, &row.OrganizationID,
			&row.ServiceAccountID, &row.IssuedByPlatformTokenID, &row.ExpiresAt, &row.RevokedDate)
	require.NoError(t, err, "the credential on stdout must correspond to a stored row")

	return row
}

func countActiveTokensNamed(t *testing.T, name string) int {
	t.Helper()

	var count int
	require.NoError(t, requireTestDB(t).DbPool.QueryRow(context.Background(),
		`SELECT count(*) FROM token WHERE name = $1 AND revoked_date IS NULL`, name).Scan(&count))

	return count
}

// issuanceEvent is one credential-issuance outbox row, as much of it as these tests
// read.
type issuanceEvent struct {
	issuedTokenID string
	data          string
}

// issuanceEvents returns the credential-issuance events recorded for one
// organization, oldest first.
//
// Selected by event name, from the constant the emitting module declares, rather
// than by counting the table: the assertion is about which event a command
// produced, and a bare count would also be satisfied by a different one.
func issuanceEvents(t *testing.T, organizationID uuid.UUID) []issuanceEvent {
	t.Helper()

	rows, err := requireTestDB(t).DbPool.Query(context.Background(), `
		SELECT data->>'issuedTokenId', data::text
		FROM outbox_events
		WHERE organization_id = $1 AND event_name = $2
		ORDER BY occurred_at`, organizationID, identityevents.SystemOrganizationTokenIssued.Name)
	require.NoError(t, err)
	defer rows.Close()

	var issuances []issuanceEvent
	for rows.Next() {
		var issuance issuanceEvent
		require.NoError(t, rows.Scan(&issuance.issuedTokenID, &issuance.data))
		issuances = append(issuances, issuance)
	}
	require.NoError(t, rows.Err())

	return issuances
}

func TestPlatformTokenCreateEmitsExactlyTheCredential(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString

	result := runAdminTools(t, dsn,
		"platform-token", "create", "--name", "emits-once", "--scopes", "read:tokens,write:tokens", "--no-expiry")

	plaintext := emittedCredential(t, result, "ksm_")

	row := fetchToken(t, plaintext)
	require.Equal(t, "platform", row.Kind)
	require.Nil(t, row.OrganizationID, "a platform credential carries no organization execution context")
	require.Equal(t, platformidentity.ID, row.ServiceAccountID)
	require.Nil(t, row.IssuedByPlatformTokenID, "a platform credential cannot have been issued by another")
	require.Nil(t, row.ExpiresAt)
	require.Nil(t, row.RevokedDate)
	require.Equal(t, []string{"read:tokens", "write:tokens"}, row.Scopes)

	// Only a verifier is stored: the value on stdout is unrecoverable from the row.
	require.NoError(t, token.Compare(row.Hash, plaintext))
	require.NotContains(t, row.Hash, plaintext)
}

func TestPlatformTokenCreateRefusesADuplicateNameAndLeaksNothing(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString

	first := emittedCredential(t, runAdminTools(t, dsn,
		"platform-token", "create", "--name", "duplicate", "--scopes", "read:tokens", "--no-expiry"), "ksm_")

	second := runAdminTools(t, dsn,
		"platform-token", "create", "--name", "duplicate", "--scopes", "read:tokens", "--no-expiry")

	require.ErrorContains(t, second.Err, `platform token "duplicate" already exists and is active`)
	require.ErrorContains(t, second.Err, "--replace")
	require.Empty(t, second.Stdout, "a failed create must not print a credential it did not store")
	require.NotContains(t, second.Err.Error(), first, "an error message must never echo a credential")
	require.NotContains(t, second.Logs, first)

	require.Equal(t, 1, countActiveTokensNamed(t, "duplicate"))
}

func TestPlatformTokenCreateReplaceRevokesAndReMints(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString

	first := emittedCredential(t, runAdminTools(t, dsn,
		"platform-token", "create", "--name", "rotated", "--scopes", "read:tokens", "--no-expiry"), "ksm_")

	second := emittedCredential(t, runAdminTools(t, dsn,
		"platform-token", "create", "--name", "rotated", "--scopes", "read:tokens", "--no-expiry", "--replace"), "ksm_")

	require.NotEqual(t, first, second, "--replace mints a fresh credential; it cannot return the old one")
	require.NotNil(t, fetchToken(t, first).RevokedDate, "the replaced credential must stop working immediately")
	require.Nil(t, fetchToken(t, second).RevokedDate)
	require.Equal(t, 1, countActiveTokensNamed(t, "rotated"))
}

func TestPlatformTokenCreateWritesToAFileWithoutTouchingStdout(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString
	path := t.TempDir() + "/platform-token"

	result := runAdminTools(t, dsn, "platform-token", "create",
		"--name", "to-a-file", "--scopes", "read:tokens", "--no-expiry", "--output-file", path)

	require.NoError(t, result.Err)
	require.Empty(t, result.Stdout, "with --output-file the credential must not also reach stdout")

	info, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o600), info.Mode().Perm())

	plaintext, err := secretfile.Read(path)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(plaintext, "ksm_"))
	require.NotContains(t, result.Logs, plaintext, "the log records the path, never the value")
	require.Contains(t, result.Logs, "platform-token", "the path is worth logging")
	require.Equal(t, "platform", fetchToken(t, plaintext).Kind)
}

func TestPlatformTokenListAndRevoke(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString

	plaintext := emittedCredential(t, runAdminTools(t, dsn,
		"platform-token", "create", "--name", "listed", "--scopes", "read:tokens", "--ttl", "1h"), "ksm_")

	listed := runAdminTools(t, dsn, "platform-token", "list")
	require.NoError(t, listed.Err)
	require.Contains(t, listed.Stdout, "listed")
	require.NotContains(t, listed.Stdout, plaintext, "list must never print a credential")
	require.NotContains(t, listed.Stdout, fetchToken(t, plaintext).Hash, "list must never print a hash")

	revoked := runAdminTools(t, dsn, "platform-token", "revoke", "listed")
	require.NoError(t, revoked.Err)
	require.Contains(t, revoked.Stdout, "and 0 token(s) it issued")
	require.NotNil(t, fetchToken(t, plaintext).RevokedDate)

	// Revoking again is a refusal, not a silent success: the operator asked to
	// retire something that is already retired, and would otherwise believe they
	// had just closed a window that closed earlier.
	again := runAdminTools(t, dsn, "platform-token", "revoke", "listed")
	require.ErrorContains(t, again.Err, `no active platform token named "listed"`)
}

func TestCommandsRefuseADatabaseWhoseSchemaIsBehind(t *testing.T) {
	tdb := requireTestDB(t)

	// A database with no goose_db_version table reads as version 0, which is the
	// same refusal an out-of-date schema gets.
	_, err := tdb.DbPool.Exec(context.Background(), `CREATE DATABASE schema_behind`)
	if err != nil {
		require.ErrorContains(t, err, "already exists")
	}

	parsed, err := url.Parse(tdb.ConnectionString)
	require.NoError(t, err)
	parsed.Path = "/schema_behind"

	result := runAdminTools(t, parsed.String(),
		"platform-token", "create", "--name", "behind", "--scopes", "read:tokens", "--no-expiry")

	require.ErrorContains(t, result.Err, "database schema is behind")
	require.ErrorContains(t, result.Err, "migrate up")
	require.Empty(t, result.Stdout)
}

func TestPlatformTokenCreateRefusesWhenThePlatformIdentityIsMissing(t *testing.T) {
	tdb := requireTestDB(t)
	ctx := context.Background()

	// The identity is created by a migration and protected against deletion, so
	// the only way to reach this state is to make it unresolvable by external id -
	// which is exactly what a database that skipped the migration looks like to
	// the query.
	//
	// Renaming it means giving up both exemptions in the same statement: the two
	// relaxed CHECK constraints are keyed on external_id = 'system:kaiten', so a row
	// carrying another external id is an ordinary machine user again and must have an
	// organization and no email. That the setup is this awkward is the constraints
	// working.
	_, err := tdb.DbPool.Exec(ctx,
		`UPDATE "user" SET external_id = 'system:kaiten:renamed', email = NULL, organization_id = $1
		 WHERE external_id = $2`, tdb.DefaultData.OrganizationID, platformidentity.ExternalID)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, restoreErr := tdb.DbPool.Exec(ctx,
			`UPDATE "user" SET external_id = $1, email = $2, organization_id = NULL
			 WHERE external_id = 'system:kaiten:renamed'`,
			platformidentity.ExternalID, platformidentity.Email)
		require.NoError(t, restoreErr)
	})

	result := runAdminTools(t, tdb.ConnectionString,
		"platform-token", "create", "--name", "no-identity", "--scopes", "read:tokens", "--no-expiry")

	require.ErrorContains(t, result.Err, "the system:kaiten platform identity does not exist")
	require.ErrorContains(t, result.Err, "migrate up")
	require.Empty(t, result.Stdout)
}

func TestConcurrentPlatformTokenCreatesYieldExactlyOneSuccess(t *testing.T) {
	// One application over the shared pool, called from several goroutines: this
	// races mintPlatformToken rather than the command, because the command reaches
	// its DSN through a process-wide environment variable and would serialize on
	// t.Setenv instead of on the database.
	//
	// That is the claim under test. The determinism comes from the unique index, not
	// from anything in this binary -- there is no read-then-write here to race -- so
	// two bootstrap Jobs starting together cannot both believe they created the
	// credential. Going through mintPlatformToken rather than the use case directly
	// is what makes the loser's message the one an operator actually sees.
	app, err := kaiten.New(kaiten.Options{
		DB:                requireTestDB(t).DbPool,
		BackgroundWorkers: false,
	})
	require.NoError(t, err)
	t.Cleanup(app.Close)

	const attempts = 4
	errs := make([]error, attempts)
	var wg sync.WaitGroup
	for i := range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, errs[i] = mintPlatformToken(context.Background(), app, &createplatformtoken.Command{
				Name:    "raced",
				Scopes:  []string{"read:tokens"},
				Replace: false,
			})
		}()
	}
	wg.Wait()

	succeeded := 0
	for _, err := range errs {
		if err == nil {
			succeeded++
			continue
		}
		require.ErrorContains(t, err, `platform token "raced" already exists and is active`)
	}

	require.Equal(t, 1, succeeded, "exactly one concurrent create may win")
	require.Equal(t, 1, countActiveTokensNamed(t, "raced"))
}

func TestOrganizationEnsureIsIdempotentAndGrantsThePlatformMembership(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString
	const externalID = "org_ensure_test"
	expectedID := externalid.DeriveOrganizationID(externalID)

	created := runAdminTools(t, dsn, "organization", "ensure", "--external-id", externalID, "--name", "First Name")
	require.NoError(t, created.Err)
	require.Equal(t, fmt.Sprintf("%s\t%s\tFirst Name\n", expectedID, externalID), created.Stdout)

	// A re-run without --name must converge on the same row and must not rename it:
	// `organization ensure` is meant to be safe to repeat against an organization a
	// human has since renamed.
	again := runAdminTools(t, dsn, "organization", "ensure", "--external-id", externalID)
	require.NoError(t, again.Err)
	require.Equal(t, created.Stdout, again.Stdout)

	var membershipCount int
	require.NoError(t, requireTestDB(t).DbPool.QueryRow(context.Background(), `
		SELECT count(*) FROM user_on_organization uoo
		JOIN "user" u ON u.id = uoo.user_id
		WHERE uoo.organization_id = $1 AND u.external_id = $2 AND uoo.deleted_at IS NULL`,
		expectedID, platformidentity.ExternalID).Scan(&membershipCount))
	require.Equal(t, 1, membershipCount,
		"the trigger must give system:kaiten its membership, so minting into a fresh organization just works")
}

func TestServiceTokenMintAgainstAnEnsuredOrganization(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString
	const externalID = "org_mint_test"
	organizationID := externalid.DeriveOrganizationID(externalID)

	require.NoError(t, runAdminTools(t, dsn, "organization", "ensure", "--external-id", externalID).Err)

	plaintext := emittedCredential(t, runAdminTools(t, dsn, "service-token", "mint",
		"--org", externalID, "--name", "Minted SDK", "--scopes", "read:customers"), "ksh_")

	row := fetchToken(t, plaintext)
	require.Equal(t, "organization", row.Kind,
		"minting yields an ordinary organization credential, never another platform one")
	require.NotNil(t, row.OrganizationID)
	require.Equal(t, organizationID, *row.OrganizationID)
	require.Equal(t, platformidentity.ID, row.ServiceAccountID)
	require.Nil(t, row.IssuedByPlatformTokenID,
		"caller.LocalPlatform holds no platform credential, so there is no parent to attribute this to - "+
			"and that is what keeps a bootstrap credential outside every platform-token revocation cascade")
	require.Nil(t, row.ExpiresAt, "an omitted --ttl means non-expiring, matching today's dogfooding token")

	// The outbox row is the effect no bare INSERT produces: the same event
	// POST /api/platform/organizations/{orgId}/tokens writes, from the same code,
	// in the transaction that wrote the credential.
	issuances := issuanceEvents(t, organizationID)
	require.Len(t, issuances, 1, "`organization ensure` emits nothing, so this is the mint's own event")
	require.Equal(t, row.ID.String(), issuances[0].issuedTokenID)
	require.NotContains(t, issuances[0].data, plaintext, "no event may carry the plaintext")

	duplicate := runAdminTools(t, dsn, "service-token", "mint",
		"--org", externalID, "--name", "Minted SDK", "--scopes", "read:customers")
	require.ErrorContains(t, duplicate.Err, "--replace")
	require.NotContains(t, duplicate.Err.Error(), plaintext)

	replaced := emittedCredential(t, runAdminTools(t, dsn, "service-token", "mint",
		"--org", externalID, "--name", "Minted SDK", "--scopes", "read:customers", "--replace"), "ksh_")
	require.NotEqual(t, plaintext, replaced)
	require.NotNil(t, fetchToken(t, plaintext).RevokedDate)
	require.Equal(t, 1, countActiveTokensNamed(t, "Minted SDK"))

	// --replace announces the successor too. The tenant hears about every credential
	// the platform holds in their organization, which is the whole reason this event
	// exists, and a re-run of a bootstrap is not an exception to it.
	require.Len(t, issuanceEvents(t, organizationID), 2)
}

func TestServiceTokenMintRefusesAnUnknownOrganization(t *testing.T) {
	result := runAdminTools(t, requireTestDB(t).ConnectionString, "service-token", "mint",
		"--org", "org_never_ensured", "--name", "Nope", "--scopes", "read:customers")

	require.ErrorContains(t, result.Err, `organization "org_never_ensured" does not exist`)
	require.ErrorContains(t, result.Err, "organization ensure")
	require.Empty(t, result.Stdout)
}

// TestLocalCredentialsPrimitivesAreRerunnable covers what
// scripts/local-credentials.sh depends on, now that composing the local stack's
// credentials is a shell script rather than a `bootstrap` subcommand.
//
// The script itself is not under test here -- it is three invocations of commands
// that are -- but the property it needs is: a second run must succeed rather than
// collide with its own last run, for BOTH credential families, and each must land
// in a 0600 file with nothing on stdout. That is what makes a repeated `task up`
// work, and it is the only reason --replace exists.
func TestLocalCredentialsPrimitivesAreRerunnable(t *testing.T) {
	dsn := requireTestDB(t).ConnectionString
	directory := t.TempDir()
	platformTokenFile := directory + "/platform-token"
	dogfoodingTokenFile := directory + "/dogfooding-token"

	const organizationExternalID = "org_dogfooding_test"
	const platformName = "local"
	const dogfoodingName = "Dogfooding Token"

	// The three commands the script runs, in the order it runs them.
	createPlatform := func() commandResult {
		return runAdminTools(t, dsn, "platform-token", "create",
			"--name", platformName,
			"--scopes", "read:organizations,read:tokens,write:tokens",
			"--no-expiry", "--replace", "--output-file", platformTokenFile)
	}
	mintDogfooding := func() commandResult {
		return runAdminTools(t, dsn, "service-token", "mint",
			"--org", organizationExternalID,
			"--name", dogfoodingName,
			"--scopes", "write:instances,read:feature_flags",
			"--replace", "--output-file", dogfoodingTokenFile)
	}

	require.NoError(t, runAdminTools(t, dsn, "organization", "ensure",
		"--external-id", organizationExternalID, "--name", "Dogfooding").Err)

	first := createPlatform()
	require.NoError(t, first.Err)
	require.Empty(t, first.Stdout, "--output-file was given; nothing belongs on stdout")

	firstDogfoodingRun := mintDogfooding()
	require.NoError(t, firstDogfoodingRun.Err)
	require.Empty(t, firstDogfoodingRun.Stdout)

	firstPlatform := readCredentialFile(t, platformTokenFile, "ksm_")
	firstDogfooding := readCredentialFile(t, dogfoodingTokenFile, "ksh_")
	require.NotContains(t, first.Logs, firstPlatform)
	require.NotContains(t, firstDogfoodingRun.Logs, firstDogfooding)

	dogfoodingRow := fetchToken(t, firstDogfooding)
	require.Equal(t, "organization", dogfoodingRow.Kind)
	require.Equal(t, externalid.DeriveOrganizationID(organizationExternalID), *dogfoodingRow.OrganizationID)
	require.Equal(t, []string{"write:instances", "read:feature_flags"}, dogfoodingRow.Scopes)
	require.Nil(t, dogfoodingRow.ExpiresAt)

	// The second run: `task up` on a stack that has already been up.
	require.NoError(t, createPlatform().Err)
	require.NoError(t, mintDogfooding().Err)

	secondPlatform := readCredentialFile(t, platformTokenFile, "ksm_")
	secondDogfooding := readCredentialFile(t, dogfoodingTokenFile, "ksh_")
	require.NotEqual(t, firstPlatform, secondPlatform)
	require.NotEqual(t, firstDogfooding, secondDogfooding)

	require.NotNil(t, fetchToken(t, firstPlatform).RevokedDate)
	require.NotNil(t, fetchToken(t, firstDogfooding).RevokedDate)
	require.Nil(t, fetchToken(t, secondPlatform).RevokedDate)
	require.Nil(t, fetchToken(t, secondDogfooding).RevokedDate)
	require.Equal(t, 1, countActiveTokensNamed(t, platformName))
	require.Equal(t, 1, countActiveTokensNamed(t, dogfoodingName))
}

func readCredentialFile(t *testing.T, path, prefix string) string {
	t.Helper()

	info, err := os.Stat(path)
	require.NoError(t, err)
	require.Equal(t, os.FileMode(0o600), info.Mode().Perm())

	plaintext, err := secretfile.Read(path)
	require.NoError(t, err)
	require.True(t, strings.HasPrefix(plaintext, prefix),
		"expected a credential prefixed %q in %s", prefix, path)

	return plaintext
}
