package organization_test

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestDeleteMembership(t *testing.T) {
	t.Run("WhenMembershipExists_SoftDeletesMembershipOnly", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		orgID := createOrganization(t)
		userID := createUser(t)
		createMembership(t, orgID, userID)

		req := httptest.NewRequest("DELETE", "/api/platform/organizations/"+orgID.String()+"/memberships/"+userID.String(), nil)
		resp, err := testServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		var membershipDeletedAt *string
		err = testDb.DbPool.QueryRow(
			t.Context(),
			`SELECT deleted_at::text FROM user_on_organization WHERE organization_id = $1 AND user_id = $2`,
			orgID, userID,
		).Scan(&membershipDeletedAt)
		require.NoError(t, err)
		require.NotNil(t, membershipDeletedAt, "membership should be soft-deleted")

		require.Equal(t, 1, countRows(t, `SELECT count(*) FROM organization WHERE id = $1`, orgID),
			"deleting a membership must not delete the organization itself")
	})

	t.Run("WhenMembershipAlreadySoftDeleted_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		orgID := createOrganization(t)
		userID := createUser(t)
		createMembership(t, orgID, userID)

		path := "/api/platform/organizations/" + orgID.String() + "/memberships/" + userID.String()

		firstResp, err := testServer.PlatformApp.Test(httptest.NewRequest("DELETE", path, nil), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, firstResp.Body)
		require.Equal(t, fiber.StatusNoContent, firstResp.StatusCode)

		secondResp, err := testServer.PlatformApp.Test(httptest.NewRequest("DELETE", path, nil), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, secondResp.Body)

		require.Equal(t, fiber.StatusNotFound, secondResp.StatusCode, "deleting an already-deleted membership must not report success")
	})

	t.Run("WhenMembershipDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		orgID := createOrganization(t)
		userID := createUser(t)
		// No membership created between orgID and userID.

		req := httptest.NewRequest("DELETE", "/api/platform/organizations/"+orgID.String()+"/memberships/"+userID.String(), nil)
		resp, err := testServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WithoutDeleteScope_Returns403", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		orgID := createOrganization(t)
		userID := createUser(t)
		createMembership(t, orgID, userID)

		readOnlyServer := tests.NewTestServer(testDb, tests.TestServerOptions{
			PlatformCredential: true,
			Scopes:             []string{scope.Write(scope.Organizations), scope.Delete(scope.Organizations)},
		})

		req := httptest.NewRequest("DELETE", "/api/platform/organizations/"+orgID.String()+"/memberships/"+userID.String(), nil)
		resp, err := readOnlyServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusForbidden, resp.StatusCode, "delete:organizations must not imply delete:memberships")
	})

	// IsGoneFromTheCoreAPI is the removal half of the move. Asserted with an
	// organization credential: it reaches the router, so a 404 means "no such
	// operation" rather than "your credential was refused first".
	t.Run("IsGoneFromTheCoreAPI", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		orgID := createOrganization(t)
		userID := createUser(t)
		createMembership(t, orgID, userID)

		req := httptest.NewRequest("DELETE", "/api/organizations/"+orgID.String()+"/memberships/"+userID.String(), nil)
		resp, err := coreServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode,
			"delete-membership is still reachable on the Core API")
		require.Equal(t, 1, countRows(t,
			`SELECT count(*) FROM user_on_organization WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
			orgID, userID), "the Core API request deleted the membership anyway")
	})

	// SystemMembershipIsProtected is the API-level half of the database
	// invariant. The credential holds every scope, so the 403 is not a permission
	// answer -- it is "this operation is never permitted". The trigger raises
	// restrict_violation and the handler translates it, which is why this is a
	// 403 with a code and not a 500.
	t.Run("SystemMembershipIsProtected", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		orgID := createOrganization(t)

		req := httptest.NewRequest("DELETE",
			"/api/platform/organizations/"+orgID.String()+"/memberships/"+platformidentity.ID.String(), nil)
		resp, err := testServer.PlatformApp.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		body := commonfixture.AssertJSONResponse[map[string]any](t, resp, fiber.StatusForbidden)
		require.Equal(t, "DeleteMembership.SystemIdentityProtected", body["code"],
			"the refusal does not name the invariant it enforced")

		require.Equal(t, 1, countRows(t,
			`SELECT count(*) FROM user_on_organization WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
			orgID, platformidentity.ID), "the system:kaiten membership was removed")
	})
}
