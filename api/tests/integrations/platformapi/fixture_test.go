// Package platformapi_test holds the boundary proof for the Platform API: that a
// platform credential cannot act on the Core API, that an organization
// credential cannot act on the Platform API, and that making system:kaiten a
// member of every organization did not make it visible inside any of them.
//
// It is deliberately its own suite rather than assertions scattered through the
// per-module suites. The boundary is one property of the whole server, and it is
// the property everything else in this feature rests on, so it is asserted in
// one place where a regression is obvious.
package platformapi_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/stretchr/testify/require"

	identitydb "github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/random"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
)

var (
	testDb *tests.TestDatabase

	// platformServer authenticates every request as a platform credential;
	// organizationServer as an ordinary organization one. Both are built over the
	// same database, because the whole point is that the same request reaches a
	// different answer depending only on the credential class.
	platformServer     *tests.TestServer
	organizationServer *tests.TestServer

	// platformTokenID is the credential the platform principal presents. A real
	// row, created by the real query, so /platform/me has something to resolve.
	platformTokenID uuid.UUID
	// platformTokenPlaintext is the same credential as a caller holds it. Needed
	// because the Platform listener authenticates the raw `ksm_` itself now --
	// listener_test.go presents this to the production authenticator rather than
	// minting a JWT for it.
	platformTokenPlaintext string
)

func TestMain(m *testing.M) {
	var err error
	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	defer testDb.TearDown()

	if err := installPlatformCredential(); err != nil {
		panic("failed to create the platform credential: " + err.Error())
	}

	code := m.Run()
	os.Exit(code)
}

// installPlatformCredential mints the credential this suite authenticates as
// and rebuilds both servers around it.
func installPlatformCredential() error {
	var err error

	platformTokenID, platformTokenPlaintext, err = createPlatformToken("boundary-suite", scope.AllScopes())
	if err != nil {
		return err
	}

	platformServer = tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformCredential: true,
		PlatformTokenID:    platformTokenID,
	})
	organizationServer = tests.NewTestServer(testDb)

	return nil
}

// resetDatabase is testDb.Reset() plus the credential it destroys. Every test
// in this package that resets must go through here.
func resetDatabase(t *testing.T) {
	t.Helper()

	require.NoError(t, testDb.Reset())
	require.NoError(t, installPlatformCredential())
}

// createPlatformToken inserts a kind='platform' row through the production
// query, so the row this suite authenticates against is subject to every
// constraint a real one is -- including token_platform_is_orgless_system, which
// is what proves the owner really is system:kaiten and not a fixture shortcut.
func createPlatformToken(name string, scopes []string) (uuid.UUID, string, error) {
	plaintext, err := random.GeneratePrefixed(token.PrefixPlatform, 32)
	if err != nil {
		return uuid.Nil, "", err
	}
	hash, err := token.Hash(plaintext)
	if err != nil {
		return uuid.Nil, "", err
	}

	row, err := identitydb.New(testDb.DbPool).CreatePlatformToken(
		context.Background(),
		identitydb.CreatePlatformTokenParams{
			Hash:       hash,
			LookupHash: token.LookupHash(plaintext),
			// Non-expiring: expiry is not what this suite is about, and a clock
			// dependency in a fixture is a flake waiting to happen.
			ExpiresAt: pgtype.Timestamp{Time: time.Time{}, InfinityModifier: 0, Valid: false},
			Scopes:    scopes,
			Name:      name,
			Slug:      "platform-" + uuid.NewString(),
		},
	)
	if err != nil {
		return uuid.Nil, "", err
	}

	return row.ID, plaintext, nil
}

// randomPlatformCredential is a well-formed `ksm_` that belongs to no row: the
// same shape a real credential has, and the only thing separating it from one is
// the database. It stands in for a forgery.
func randomPlatformCredential() (string, error) {
	return random.GeneratePrefixed(token.PrefixPlatform, 32)
}

// createOrganization makes a second tenant. Several tests need two, because a
// boundary that holds in one organization and not its neighbour is not a
// boundary.
func createOrganization(t *testing.T) uuid.UUID {
	t.Helper()

	organization, err := organizationdb.New(testDb.DbPool).CreateOrganization(
		t.Context(),
		organizationdb.CreateOrganizationParams{
			ID:         nil,
			ExternalID: "org-" + uuid.NewString(),
			Name:       "Neighbouring Organization",
		},
	)
	require.NoError(t, err)

	return organization.ID
}
