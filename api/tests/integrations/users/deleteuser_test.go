package users_test

import (
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteUser(t *testing.T) {
	t.Run("WhenUserExists_SoftDeletesUser", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		userID := createUser(t)

		req := httptest.NewRequest("DELETE", "/api/platform/users/"+userID.String(), nil)
		resp, err := testServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		var deletedAt *string
		err = testDb.DbPool.QueryRow(t.Context(), `SELECT deleted_at::text FROM "user" WHERE id = $1`, userID).Scan(&deletedAt)
		require.NoError(t, err)
		require.NotNil(t, deletedAt, "user should be soft-deleted")
	})

	t.Run("WhenUserAlreadySoftDeleted_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		userID := createUser(t)

		firstReq := httptest.NewRequest("DELETE", "/api/platform/users/"+userID.String(), nil)
		firstResp, err := testServer.PlatformApp.Test(firstReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, firstResp.Body)
		require.Equal(t, fiber.StatusNoContent, firstResp.StatusCode)

		secondReq := httptest.NewRequest("DELETE", "/api/platform/users/"+userID.String(), nil)
		secondResp, err := testServer.PlatformApp.Test(secondReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, secondResp.Body)

		require.Equal(t, fiber.StatusNotFound, secondResp.StatusCode, "deleting an already-deleted user must not report success")
	})

	t.Run("WhenUserDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		req := httptest.NewRequest("DELETE", "/api/platform/users/00000000-0000-0000-0000-000000000099", nil)
		resp, err := testServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WithoutDeleteScope_Returns403", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		userID := createUser(t)

		readOnlyServer := tests.NewTestServer(testDb, tests.TestServerOptions{
			PlatformCredential: true,
			Scopes:             []string{scope.Write(scope.Users)},
		})

		req := httptest.NewRequest("DELETE", "/api/platform/users/"+userID.String(), nil)
		resp, err := readOnlyServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusForbidden, resp.StatusCode, "write:users must not imply delete:users")
	})

	// TestDeleteUser_GoneFromTheCoreAPI is the removal half of the move. Asserted
	// with an organization credential and not a platform one, because that is the
	// credential this surface serves: it gets past every middleware on /api and
	// reaches the router, so a 404 here really does mean "no such operation" rather
	// than "something declined to route it".
	t.Run("IsGoneFromTheCoreAPI", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		userID := createUser(t)

		req := httptest.NewRequest("DELETE", "/api/users/"+userID.String(), nil)
		resp, err := coreServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusMethodNotAllowed, resp.StatusCode,
			"Core user management must not expose global deletion")

		var deletedAt *string
		err = testDb.DbPool.QueryRow(t.Context(), `SELECT deleted_at::text FROM "user" WHERE id = $1`, userID).Scan(&deletedAt)
		require.NoError(t, err)
		require.Nil(t, deletedAt, "the Core API request deleted the user anyway")
	})

	// TestDeleteUser_PlatformIdentityIsProtected is the API-level half of the
	// database invariant: the trigger raises restrict_violation, the handler
	// translates it, and the caller sees a 403 with a code that says why rather
	// than a 500. The credential holds every scope, so this is not a permission
	// answer -- it is "this operation is never permitted".
	t.Run("PlatformIdentityCannotBeDeleted", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		req := httptest.NewRequest("DELETE", "/api/platform/users/"+platformidentity.ID.String(), nil)
		resp, err := testServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		body := commonfixture.AssertJSONResponse[map[string]any](t, resp, fiber.StatusForbidden)
		require.Equal(t, "DeleteUser.SystemIdentityProtected", body["code"],
			"the refusal does not name the invariant it enforced")

		var deletedAt *string
		err = testDb.DbPool.QueryRow(t.Context(),
			`SELECT deleted_at::text FROM "user" WHERE external_id = $1`, platformidentity.ExternalID).Scan(&deletedAt)
		require.NoError(t, err)
		require.Nil(t, deletedAt, "the platform identity was soft-deleted")
	})
}

// seatReleases records the seats a deletion gives back, per organization.
type seatReleases struct {
	services.NoopUsageReporter

	mu       sync.Mutex
	released map[uuid.UUID]int
}

func (r *seatReleases) DecrementAsync(organizationID uuid.UUID, entitlementSlug string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if entitlementSlug == dogfooding.SeatEntitlementSlug {
		r.released[organizationID]++
	}
}

// A deleted user gives back one seat in each organization they were a live member
// of, and none in one they had already been removed from.
func TestDeleteUserReleasesItsSeats(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	reporter := &seatReleases{released: map[uuid.UUID]int{}}
	server := tests.NewTestServer(testDb, tests.TestServerOptions{PlatformCredential: true, UsageReporter: reporter})

	userID := createUser(t)
	member, removed := uuid.New(), uuid.New()
	for _, organizationID := range []uuid.UUID{member, removed} {
		_, err := testDb.DbPool.Exec(t.Context(),
			`INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Seat org')`, organizationID, "ext-"+organizationID.String())
		require.NoError(t, err)
		_, err = testDb.DbPool.Exec(t.Context(),
			`INSERT INTO user_on_organization (user_id, organization_id) VALUES ($1, $2)`, userID, organizationID)
		require.NoError(t, err)
	}
	_, err := testDb.DbPool.Exec(t.Context(),
		`UPDATE user_on_organization SET deleted_at = now() WHERE user_id = $1 AND organization_id = $2`, userID, removed)
	require.NoError(t, err)

	req := httptest.NewRequest("DELETE", "/api/platform/users/"+userID.String(), nil)
	resp, err := server.PlatformApp.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)
	require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

	reporter.mu.Lock()
	defer reporter.mu.Unlock()
	require.Equal(t, map[uuid.UUID]int{member: 1}, reporter.released)
}
