package releases_test

import (
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetReleases(t *testing.T) {
	t.Run("WhenEmpty_ReturnsEmptyList", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/releases", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Release]](t, resp, fiber.StatusOK)
		require.Empty(t, actual.Items)
		require.False(t, actual.HasMore)
		require.Nil(t, actual.NextCursor)
	})

	t.Run("WhenOneReleaseExists_ReturnsThatRelease", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdReleases := createReleases(t, 1)
		expected := *createdReleases[0]

		// Act
		req := httptest.NewRequest("GET", "/api/releases", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Release]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 1)
		require.Equal(t, expected, actual.Items[0])
	})

	t.Run("WhenMultipleReleasesExist_ReturnsAllReleases", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdReleases := createReleases(t, 3)
		expected := make([]schema.Release, len(createdReleases))
		for i, release := range createdReleases {
			expected[i] = *release
		}

		// Act
		req := httptest.NewRequest("GET", "/api/releases", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert -- order is now created_at DESC, id DESC (not creation
		// order), so compare as a set.
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Release]](t, resp, fiber.StatusOK)
		require.ElementsMatch(t, expected, actual.Items)
		require.False(t, actual.HasMore)
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createReleases(t, 3)

		// Act -- ask for only 2
		req := httptest.NewRequest("GET", "/api/releases?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Release]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_WalksAllPagesWithoutOverlapOrGaps", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdReleases := createReleases(t, 3)
		expected := make([]schema.Release, len(createdReleases))
		for i, release := range createdReleases {
			expected[i] = *release
		}

		// Act -- page 1
		req := httptest.NewRequest("GET", "/api/releases?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[schema.Release]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act -- page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/releases?limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert -- the remaining entry, no further page, and the two pages
		// together cover every release exactly once.
		page2 := commonfixture.AssertJSONResponse[pagination.Page[schema.Release]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)

		combined := append(append([]schema.Release{}, page1.Items...), page2.Items...)
		require.ElementsMatch(t, expected, combined)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/releases?cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
