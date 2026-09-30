package instances_test

import (
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetAuditTrails(t *testing.T) {
	t.Run("WhenNoEntries_ReturnsEmptyList", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[*schema.AuditTrail]](t, resp, fiber.StatusOK)
		require.Empty(t, actual.Items)
		require.False(t, actual.HasMore)
		require.Nil(t, actual.NextCursor)
	})

	t.Run("WhenEntriesExist_ReturnsListWithInstanceSlug", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[*schema.AuditTrail]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.Equal(t, instances[0].Slug, actual.Items[0].InstanceSlug)
		require.Equal(t, instances[0].Slug, actual.Items[1].InstanceSlug)
		require.Equal(t, "kaiten.v1.entitlement.value.get", actual.Items[0].EventName)
		require.False(t, actual.HasMore)
	})

	t.Run("WhenEntriesExistForDifferentInstances_ReturnsOnlyMatchingInstance", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 2)
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")
		newAuditTrailEntry(t, instances[1].Slug, "kaiten.v1.entitlement.value.get")

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[*schema.AuditTrail]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 1)
		require.Equal(t, instances[0].Slug, actual.Items[0].InstanceSlug)
	})

	t.Run("FilterByEventName_ReturnsOnlyMatchingEntries", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.other.event")

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails?event_name=kaiten.v1.entitlement.value.get", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[*schema.AuditTrail]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 1)
		require.Equal(t, "kaiten.v1.entitlement.value.get", actual.Items[0].EventName)
	})

	t.Run("FilterByAfter_ExcludesOlderEntries", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")

		// A future timestamp means no entries should be returned
		future := time.Now().UTC().Add(1 * time.Hour).Format(time.RFC3339)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails?after="+future, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[*schema.AuditTrail]](t, resp, fiber.StatusOK)
		require.Empty(t, actual.Items)
	})

	t.Run("FilterByBefore_ExcludesNewerEntries", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")

		// A past timestamp means no entries should be returned
		past := time.Now().UTC().Add(-1 * time.Hour).Format(time.RFC3339)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails?before="+past, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[*schema.AuditTrail]](t, resp, fiber.StatusOK)
		require.Empty(t, actual.Items)
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")

		// Act — ask for only 2
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[*schema.AuditTrail]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_FetchesRemainingEntriesThenStops", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")

		// Act — page 1
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[*schema.AuditTrail]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act — page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails?limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert — the remaining entry, no further page, and no overlap with page 1
		page2 := commonfixture.AssertJSONResponse[pagination.Page[*schema.AuditTrail]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)
		require.NotEqual(t, page1.Items[0].ID, page2.Items[0].ID)
		require.NotEqual(t, page1.Items[1].ID, page2.Items[0].ID)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails?cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})

	t.Run("AuditTrailEntryHasExpectedFields", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		instances := newInstances(t, 1)
		newAuditTrailEntry(t, instances[0].Slug, "kaiten.v1.entitlement.value.get")

		// Act
		req := httptest.NewRequest("GET", "/api/instances/"+instances[0].Slug+"/audit-trails", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[*schema.AuditTrail]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 1)
		entry := actual.Items[0]
		require.Equal(t, instances[0].Slug, entry.InstanceSlug)
		require.NotNil(t, entry.InstanceID)
		require.Equal(t, instances[0].ID, *entry.InstanceID)
		require.Equal(t, "kaiten.v1.entitlement.value.get", entry.EventName)
		require.False(t, entry.Timestamp.IsZero())
	})
}
