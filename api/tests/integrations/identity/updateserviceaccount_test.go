package identity_test

import (
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestUpdateServiceAccount(t *testing.T) {
	t.Run("WhenRequestIsValid_UpdatesServiceAccount", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		sa, err := createSA(t, "original-name", "sa-external-id", testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		updatePayload := map[string]interface{}{
			"name": "updated-name",
		}

		req := commonfixture.NewJSONRequest(t, "PUT", "/api/service-accounts/"+*sa.Slug, updatePayload)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)
	})

	t.Run("WhenAnotherOrganizationOwnsTheSameSlug_LeavesItByteIdentical", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		const sharedSlug = "ci"
		_, err := createSAWithSlug(t, "my-ci", sharedSlug, "sa-external-mine", testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		neighbourOrganizationID, err := createOrganization(t)
		require.NoError(t, err)
		neighbour, err := createSAWithSlug(t, "neighbour-ci", sharedSlug, "sa-external-neighbour", neighbourOrganizationID)
		require.NoError(t, err)

		const snapshotQuery = `SELECT to_jsonb(u) FROM "user" u WHERE id = $1`
		before := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, neighbour.ID)

		req := commonfixture.NewJSONRequest(t, "PUT", "/api/service-accounts/"+sharedSlug, map[string]interface{}{
			"name": "updated-name",
		})

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNoContent, resp.StatusCode)

		after := commonfixture.RowSnapshot(t, testServer.Dependencies.DB, snapshotQuery, neighbour.ID)
		require.Equal(t, before, after, "the neighbouring organization's service account must be untouched")
	})
}
