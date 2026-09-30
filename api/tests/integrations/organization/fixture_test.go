package organization_test

import (
	"os"
	"testing"

	"github.com/google/uuid"

	organizationdb "github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
	usersdb "github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/tests"
)

var (
	testDb *tests.TestDatabase

	// testServer authenticates every request as a platform credential. Both
	// operations this suite covers are Platform API operations: they take the
	// organization from the path and authorize on a scope alone, so an
	// organization credential cannot reach either of them.
	//
	// They are called through testServer.PlatformApp, not .App -- the Platform API
	// has its own listener, and /api/platform/** is not registered on the public
	// one at all.
	testServer *tests.TestServer

	// coreServer authenticates as an ordinary organization credential, for the
	// two assertions that the operations are gone from /api/organizations.
	//
	// The credential the surface actually serves is what makes a 404 mean "no such
	// operation" and nothing else. A platform credential would reach the router too
	// now that no default-deny middleware stands in front of it, but a test that
	// proves a route is absent should not also depend on a reader knowing which
	// layer would have refused it had it been present.
	coreServer *tests.TestServer
)

func TestMain(m *testing.M) {
	var err error
	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	defer testDb.TearDown()

	testServer = tests.NewTestServer(testDb, tests.TestServerOptions{PlatformCredential: true})
	coreServer = tests.NewTestServer(testDb)

	code := m.Run()
	os.Exit(code)
}

func createOrganization(t *testing.T) uuid.UUID {
	t.Helper()
	organization, err := organizationdb.New(testServer.Dependencies.DB).CreateOrganization(t.Context(), organizationdb.CreateOrganizationParams{
		ID:         nil,
		ExternalID: "org-" + uuid.NewString(),
		Name:       "Delete-Target Organization",
	})
	if err != nil {
		t.Fatalf("failed to create organization: %v", err)
	}
	return organization.ID
}

func createUser(t *testing.T) uuid.UUID {
	t.Helper()
	email := "user-" + uuid.NewString() + "@example.com"
	user, err := usersdb.New(testServer.Dependencies.DB).CreateUser(t.Context(), usersdb.CreateUserParams{
		ID:         nil,
		ExternalID: "ext-" + uuid.NewString(),
		Email:      &email,
		Name:       "Delete-Target User",
	})
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}
	return user.ID
}

func createMembership(t *testing.T, organizationID, userID uuid.UUID) {
	t.Helper()
	_, err := organizationdb.New(testServer.Dependencies.DB).CreateUserOnOrganization(t.Context(), organizationdb.CreateUserOnOrganizationParams{
		UserID:         userID,
		OrganizationID: organizationID,
	})
	if err != nil {
		t.Fatalf("failed to create membership: %v", err)
	}
}
