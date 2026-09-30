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

func TestGetInstances(t *testing.T) {
	t.Run("WhenEmpty_ReturnsEmptyList", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/instances", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Instance]](t, resp, fiber.StatusOK)
		require.Empty(t, actual.Items)
		require.False(t, actual.HasMore)
		require.Nil(t, actual.NextCursor)
	})

	t.Run("WhenOneInstanceExists_ReturnsThatInstance", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdInstances := newInstances(t, 1)
		expected := *createdInstances[0]

		// Act
		req := httptest.NewRequest("GET", "/api/instances", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Instance]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 1)
		require.Equal(t, expected, actual.Items[0])
	})

	t.Run("WhenMultipleInstancesExist_ReturnsAllInstances", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdInstances := newInstances(t, 3)
		expected := make([]schema.Instance, len(createdInstances))
		for i, instance := range createdInstances {
			expected[i] = *instance
		}

		// Act
		req := httptest.NewRequest("GET", "/api/instances", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert -- order is now created_at DESC, id DESC (not creation
		// order), so compare as a set.
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Instance]](t, resp, fiber.StatusOK)
		require.ElementsMatch(t, expected, actual.Items)
		require.False(t, actual.HasMore)
	})

	t.Run("WhenInstanceHasMetadata_ReturnsMetadata", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		customer := newCustomer(t)
		license := newLicense(t)
		payload := schema.Instance{
			Name:             "Metadata Instance",
			Description:      "Instance with metadata",
			StartLicenseDate: time.Now().UTC(),
			EndLicenseDate:   time.Now().AddDate(1, 0, 0).UTC(),
			Metadata: map[string]any{
				"owner": "team-growth",
				"tier":  "enterprise",
			},
			LicenseID:  license.ID,
			CustomerID: customer.ID,
		}

		createReq := commonfixture.NewJSONRequest(t, "POST", "/api/instances", payload)
		createResp, err := testServer.App.Test(createReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, createResp.Body)
		require.Equal(t, fiber.StatusCreated, createResp.StatusCode)

		req := httptest.NewRequest("GET", "/api/instances", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Instance]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 1)
		require.Equal(t, payload.Metadata, actual.Items[0].Metadata)
		require.Equal(t, schema.InstanceStatusHealthy, actual.Items[0].Status)
	})

	t.Run("WhenInstanceIsDeleted_DoesNotReturnDeletedInstance", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdInstances := newInstances(t, 2)
		instanceToDelete := createdInstances[0]

		// Delete the first instance -- a real, hard delete (see
		// deleteinstance's DeleteInstance query): the row is gone, not
		// flagged.
		deleteReq := httptest.NewRequest("DELETE", "/api/instances/"+instanceToDelete.Slug, nil)
		deleteResp, err := testServer.App.Test(deleteReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, deleteResp.Body)
		require.Equal(t, fiber.StatusNoContent, deleteResp.StatusCode)

		// Act
		req := httptest.NewRequest("GET", "/api/instances", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert - Only the non-deleted instance should be returned
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Instance]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 1)
		require.Equal(t, createdInstances[1].ID, actual.Items[0].ID)
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		newInstances(t, 3)

		// Act -- ask for only 2
		req := httptest.NewRequest("GET", "/api/instances?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Instance]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_WalksAllPagesWithoutOverlapOrGaps", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdInstances := newInstances(t, 3)
		expected := make([]schema.Instance, len(createdInstances))
		for i, instance := range createdInstances {
			expected[i] = *instance
		}

		// Act -- page 1
		req := httptest.NewRequest("GET", "/api/instances?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[schema.Instance]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act -- page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/instances?limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert -- the remaining entry, no further page, and the two pages
		// together cover every instance exactly once.
		page2 := commonfixture.AssertJSONResponse[pagination.Page[schema.Instance]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)

		combined := append(append([]schema.Instance{}, page1.Items...), page2.Items...)
		require.ElementsMatch(t, expected, combined)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/instances?cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
