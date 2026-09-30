package entitlements_test

import (
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func createEntitlementGroups(t *testing.T, count int) []*schema.EntitlementGroup {
	groups := make([]*schema.EntitlementGroup, 0, count)
	for i := range count {
		suffix := strconv.Itoa(i)
		groups = append(groups, createEntitlementGroup(t, "Group "+suffix, "group-"+suffix))
	}
	return groups
}

func TestGetEntitlementGroups(t *testing.T) {
	t.Run("WhenEmpty_ReturnsEmptyList", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/entitlement-groups", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.EntitlementGroup]](t, resp, fiber.StatusOK)
		require.Empty(t, actual.Items)
		require.False(t, actual.HasMore)
		require.Nil(t, actual.NextCursor)
	})

	t.Run("WhenOneGroupExists_ReturnsThatGroup", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdGroups := createEntitlementGroups(t, 1)
		expected := []schema.EntitlementGroup{*createdGroups[0]}

		// Act
		req := httptest.NewRequest("GET", "/api/entitlement-groups", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.EntitlementGroup]](t, resp, fiber.StatusOK)
		require.Equal(t, expected, actual.Items)
		require.False(t, actual.HasMore)
		require.Nil(t, actual.NextCursor)
	})

	t.Run("WhenMultipleGroupsExist_ReturnsAllGroups", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdGroups := createEntitlementGroups(t, 3)
		expected := make([]schema.EntitlementGroup, len(createdGroups))
		for i, group := range createdGroups {
			expected[i] = *group
		}

		// Act
		req := httptest.NewRequest("GET", "/api/entitlement-groups", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert -- id DESC (no created_at column on this table), not
		// creation order, so compare as a set.
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.EntitlementGroup]](t, resp, fiber.StatusOK)
		require.ElementsMatch(t, expected, actual.Items)
		require.False(t, actual.HasMore)
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createEntitlementGroups(t, 3)

		// Act -- ask for only 2
		req := httptest.NewRequest("GET", "/api/entitlement-groups?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.EntitlementGroup]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_WalksAllPagesWithoutOverlapOrGaps", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdGroups := createEntitlementGroups(t, 3)
		expected := make([]schema.EntitlementGroup, len(createdGroups))
		for i, group := range createdGroups {
			expected[i] = *group
		}

		// Act -- page 1
		req := httptest.NewRequest("GET", "/api/entitlement-groups?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[schema.EntitlementGroup]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act -- page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/entitlement-groups?limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert -- the remaining entry, no further page, and the two pages
		// together cover every group exactly once.
		page2 := commonfixture.AssertJSONResponse[pagination.Page[schema.EntitlementGroup]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)

		combined := append(append([]schema.EntitlementGroup{}, page1.Items...), page2.Items...)
		require.ElementsMatch(t, expected, combined)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/entitlement-groups?cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
