package users_test

import (
	"os"
	"testing"

	"github.com/google/uuid"

	usersdb "github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/tests"
)

var (
	testDb *tests.TestDatabase

	// testServer authenticates every request as a platform credential, because
	// delete-user is a Platform API operation: it takes a user id from the path
	// and authorizes on delete:users alone, so an organization credential cannot
	// reach it at all.
	//
	// It is called through testServer.PlatformApp, not .App -- the Platform API
	// has its own listener, and /api/platform/** is not registered on the public
	// one at all.
	testServer *tests.TestServer

	// coreServer authenticates as an ordinary organization credential. It exists
	// for exactly one assertion -- that the operation is gone from /api/users --
	// and it uses the credential the surface actually serves so that the 404 means
	// "no such operation" and nothing else. See the same fixture in
	// tests/integrations/organization for why that still matters now that no
	// default-deny middleware answers ahead of the router.
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
