package customers_test

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetCustomers(t *testing.T) {
	t.Run("WhenEmpty_ReturnsEmptyList", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/customers", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Customer]](t, resp, fiber.StatusOK)
		require.Empty(t, actual.Items)
		require.False(t, actual.HasMore)
		require.Nil(t, actual.NextCursor)
	})

	t.Run("WhenOneCustomerExists_ReturnsThatCustomer", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdCustomers := createCustomers(t, 1)
		expected := *createdCustomers[0]

		// Act
		req := httptest.NewRequest("GET", "/api/customers", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Customer]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 1)
		require.Equal(t, expected, actual.Items[0])
		require.False(t, actual.HasMore)
	})

	t.Run("WhenMultipleCustomersExist_ReturnsAllCustomers", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdCustomers := createCustomers(t, 3)
		expected := make([]schema.Customer, len(createdCustomers))
		for i, customer := range createdCustomers {
			expected[i] = *customer
		}

		// Act
		req := httptest.NewRequest("GET", "/api/customers", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert -- order is now created_at DESC, id DESC (not creation
		// order), so compare as a set.
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Customer]](t, resp, fiber.StatusOK)
		require.ElementsMatch(t, expected, actual.Items)
		require.False(t, actual.HasMore)
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createCustomers(t, 3)

		// Act -- ask for only 2
		req := httptest.NewRequest("GET", "/api/customers?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Customer]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_WalksAllPagesWithoutOverlapOrGaps", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		createdCustomers := createCustomers(t, 3)
		expected := make([]schema.Customer, len(createdCustomers))
		for i, customer := range createdCustomers {
			expected[i] = *customer
		}

		// Act -- page 1
		req := httptest.NewRequest("GET", "/api/customers?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[schema.Customer]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act -- page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/customers?limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert -- the remaining entry, no further page, and the two pages
		// together cover every customer exactly once.
		page2 := commonfixture.AssertJSONResponse[pagination.Page[schema.Customer]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)

		combined := append(append([]schema.Customer{}, page1.Items...), page2.Items...)
		require.ElementsMatch(t, expected, combined)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/customers?cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}

// TestGetCustomersWithMalformedCursor pins the unified error envelope
// end-to-end on a Huma route: the business code lives in `code`, the body
// is problem+json, and the underlying base64/JSON decode text — which the
// handler wraps as an internal cause — never reaches the client.
func TestGetCustomersWithMalformedCursor(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	req := httptest.NewRequest("GET", "/api/customers?cursor=not-a-valid-cursor!!", nil)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	require.Contains(t, resp.Header.Get("Content-Type"), "application/problem+json")

	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.NotContains(t, string(raw), "base64")
	require.NotContains(t, string(raw), "pagination")

	var problem apierrors.Problem
	require.NoError(t, json.Unmarshal(raw, &problem))
	require.Equal(t, "Customers.InvalidCursor", problem.Code)
	require.Equal(t, "invalid cursor", problem.Detail)
	require.Equal(t, fiber.StatusBadRequest, problem.Status)
	require.Equal(t, "/api/customers", problem.Instance)
	require.Empty(t, problem.Errors, "the wrapped cause must not survive in errors[]")
}
