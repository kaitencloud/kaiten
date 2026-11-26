package identity_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/deleteserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func deleteServiceAccount(t *testing.T, slug string) (int, string) {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, "DELETE", "/api/service-accounts/"+slug, nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	var problem struct {
		Code string `json:"code"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&problem)
	return resp.StatusCode, problem.Code
}

func TestDeleteServiceAccount(t *testing.T) {
	t.Run("WhenAccountExists_DeletesItAndRevokesItsTokens", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]
		plainToken := createToken(t, *sa.Slug)

		// Validated once before the delete, so the credential is in the
		// in-memory cache: the 401 below proves the delete evicts it, not only
		// that the database refuses it.
		before := validateToken(t, plainToken)
		commonfixture.MustCloseBody(t, before.Body)
		require.Equal(t, http.StatusOK, before.StatusCode)

		// Act
		status, _ := deleteServiceAccount(t, *sa.Slug)

		// Assert
		require.Equal(t, fiber.StatusNoContent, status)

		after := validateToken(t, plainToken)
		defer commonfixture.MustCloseBody(t, after.Body)
		require.Equal(t, http.StatusUnauthorized, after.StatusCode)

		get, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "GET", "/api/service-accounts/"+*sa.Slug, nil), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, get.Body)
		require.Equal(t, fiber.StatusNotFound, get.StatusCode)

		// Soft: the row stays, as the author of what it wrote, and every token
		// it held is recorded as revoked.
		var deleted bool
		require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
			`SELECT deleted_at IS NOT NULL FROM "user" WHERE id = $1`, sa.ID).Scan(&deleted))
		require.True(t, deleted)

		var active int
		require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
			`SELECT count(*) FROM token WHERE service_account_id = $1 AND revoked_date IS NULL`, sa.ID).Scan(&active))
		require.Zero(t, active)
	})

	t.Run("WhenAccountIsDeleted_ItsSlugCanBeGivenAgain", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		const slug = "ci"
		_, err := createSAWithSlug(t, "ci", slug, "sa-external-first", testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		status, _ := deleteServiceAccount(t, slug)
		require.Equal(t, fiber.StatusNoContent, status)

		// Act
		reuse := slug
		resp, err := testServer.App.Test(commonfixture.NewJSONRequest(t, "POST", "/api/service-accounts",
			schema.ServiceAccount{Name: "ci again", Slug: reuse}), fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusCreated, resp.StatusCode)
	})

	t.Run("WhenAccountIsUnknownOrAlreadyDeleted_AnswersNotFound", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		status, _ := deleteServiceAccount(t, *sas[0].Slug)
		require.Equal(t, fiber.StatusNoContent, status)

		// Act
		again, againCode := deleteServiceAccount(t, *sas[0].Slug)
		unknown, unknownCode := deleteServiceAccount(t, "no-such-account")

		// Assert
		require.Equal(t, fiber.StatusNotFound, again)
		require.Equal(t, deleteserviceaccount.NotFoundCode, againCode)
		require.Equal(t, fiber.StatusNotFound, unknown)
		require.Equal(t, deleteserviceaccount.NotFoundCode, unknownCode)
	})

	t.Run("WhenAnotherOrganizationOwnsTheSlug_LeavesItUntouched", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		const sharedSlug = "ci"
		neighbourOrganizationID, err := createOrganization(t)
		require.NoError(t, err)
		neighbour, err := createSAWithSlug(t, "neighbour-ci", sharedSlug, "sa-external-neighbour", neighbourOrganizationID)
		require.NoError(t, err)

		const snapshotQuery = `SELECT to_jsonb(u) FROM "user" u WHERE id = $1`
		before := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, neighbour.ID)

		// Act
		status, code := deleteServiceAccount(t, sharedSlug)

		// Assert
		require.Equal(t, fiber.StatusNotFound, status)
		require.Equal(t, deleteserviceaccount.NotFoundCode, code)
		after := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, neighbour.ID)
		require.Equal(t, before, after, "the neighbouring organization's service account must be untouched")
	})
}
