package licenses_test

import (
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetLicenses(t *testing.T) {
	t.Run("WhenEmpty_ReturnsEmptyList", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/licenses", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.License]](t, resp, fiber.StatusOK)
		require.Empty(t, actual.Items)
		require.False(t, actual.HasMore)
		require.Nil(t, actual.NextCursor)
	})

	t.Run("WhenOneLicenseExists_ReturnsThatLicense", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdLicenses := newLicenses(t, 1)
		expected := *createdLicenses[0]

		// Act
		req := httptest.NewRequest("GET", "/api/licenses", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.License]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 1)
		require.Equal(t, expected, actual.Items[0])
	})

	t.Run("WhenMultipleLicensesExist_ReturnsAllLicenses", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdLicenses := newLicenses(t, 3)
		expected := make([]schema.License, len(createdLicenses))
		for i, license := range createdLicenses {
			expected[i] = *license
		}

		// Act
		req := httptest.NewRequest("GET", "/api/licenses", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert -- order is created_at DESC, id DESC. created_at has only
		// millisecond precision, so licenses created in quick succession
		// within the test can legitimately tie on it, at which point id DESC
		// (a random UUID) breaks the tie -- not creation order. Compare as a
		// set rather than assuming a specific order; the chronological
		// ordering itself is asserted in OrdersNewestFirst below, which
		// spaces created_at out explicitly.
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.License]](t, resp, fiber.StatusOK)
		require.ElementsMatch(t, expected, actual.Items)
		require.False(t, actual.HasMore)
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newLicenses(t, 3)

		// Act -- ask for only 2
		req := httptest.NewRequest("GET", "/api/licenses?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.License]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_WalksAllPagesWithoutOverlapOrGaps", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdLicenses := newLicenses(t, 3)
		expected := make([]schema.License, len(createdLicenses))
		for i, license := range createdLicenses {
			expected[i] = *license
		}

		// Act -- page 1
		req := httptest.NewRequest("GET", "/api/licenses?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[schema.License]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act -- page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/licenses?limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert -- the remaining entry, no further page, and the two pages
		// together cover every license exactly once.
		page2 := commonfixture.AssertJSONResponse[pagination.Page[schema.License]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)

		combined := append(append([]schema.License{}, page1.Items...), page2.Items...)
		require.ElementsMatch(t, expected, combined)
	})

	t.Run("OrdersNewestFirst", func(t *testing.T) {
		// Arrange -- created_at is millisecond-precision, so licenses made in
		// a loop can share an instant. Space them out explicitly: the point
		// under test is that the keyset is chronological, not how
		// fast the fixture inserts.
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdLicenses := newLicenses(t, 3)
		for i, license := range createdLicenses {
			backdateLicense(t, license.Slug, time.Duration(len(createdLicenses)-i)*time.Hour)
		}

		// Act -- one row per page, following the cursor to the end.
		var walked []schema.License
		cursor := ""
		for {
			target := "/api/licenses?limit=1"
			if cursor != "" {
				target += "&cursor=" + url.QueryEscape(cursor)
			}
			resp, err := testServer.App.Test(httptest.NewRequest("GET", target, nil), fiber.TestConfig{})
			require.NoError(t, err)
			page := commonfixture.AssertJSONResponse[pagination.Page[schema.License]](t, resp, fiber.StatusOK)
			commonfixture.MustCloseBody(t, resp.Body)

			walked = append(walked, page.Items...)
			if !page.HasMore {
				require.Nil(t, page.NextCursor)
				break
			}
			require.NotNil(t, page.NextCursor)
			cursor = *page.NextCursor
		}

		// Assert -- newest first, and the cursor carries that order across
		// pages rather than restarting from an arbitrary point.
		require.Len(t, walked, len(createdLicenses))
		for i := 1; i < len(walked); i++ {
			require.Truef(t, walked[i-1].CreatedAt.After(walked[i].CreatedAt),
				"license %q (%s) should sort before %q (%s)",
				walked[i-1].Slug, walked[i-1].CreatedAt, walked[i].Slug, walked[i].CreatedAt)
		}
		require.Equal(t, createdLicenses[len(createdLicenses)-1].Slug, walked[0].Slug)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/licenses?cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
