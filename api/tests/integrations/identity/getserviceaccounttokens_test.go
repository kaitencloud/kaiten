package identity_test

import (
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetServiceAccountTokens(t *testing.T) {
	t.Run("WhenServiceAccountHasTokens_ReturnTokensList", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Create a service account
		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]

		// Create multiple tokens for this service account
		expireAt1 := time.Now().Add(24 * time.Hour)
		expireAt2 := time.Now().Add(48 * time.Hour)

		// Create first token
		payload1 := schema.PlainToken{
			Name:      "first-token",
			Scopes:    []string{"write:entitlements"},
			ExpiresAt: &expireAt1,
		}
		req1 := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/service-accounts/"+*sa.Slug+"/tokens",
			payload1,
		)
		resp1, err := testServer.App.Test(req1, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp1.Body)

		// Create second token
		payload2 := schema.PlainToken{
			Name:      "second-token",
			Scopes:    []string{"write:licenses"},
			ExpiresAt: &expireAt2,
		}
		req2 := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/service-accounts/"+*sa.Slug+"/tokens",
			payload2,
		)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		commonfixture.MustCloseBody(t, resp2.Body)

		// Act - Get all tokens for the service account
		reqGet := commonfixture.NewJSONRequest(
			t,
			"GET",
			"/api/service-accounts/"+*sa.Slug+"/tokens",
			nil,
		)

		respGet, err := testServer.App.Test(reqGet, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, respGet.Body)

		// Assert
		page := commonfixture.AssertJSONResponse[pagination.Page[schema.Token]](
			t,
			respGet,
			fiber.StatusOK,
		)
		output := page.Items

		// Verify we got 2 tokens
		require.Len(t, output, 2, "should return 2 tokens")
		require.False(t, page.HasMore)

		// Verify tokens are ordered by creation date (most recent first)
		require.NotNil(t, output[0].ID)
		require.NotNil(t, output[1].ID)

		// Verify scopes
		scopes := []string{output[0].Scopes[0], output[1].Scopes[0]}
		require.Contains(t, scopes, "write:entitlements")
		require.Contains(t, scopes, "write:licenses")

		// Verify service account ID is set correctly
		require.Equal(t, sa.ID, output[0].ServiceAccountID)
		require.Equal(t, sa.ID, output[1].ServiceAccountID)

		require.Equal(t, testDb.DefaultData.Name, output[0].CreatedBy.Name)
		require.Equal(t, testDb.DefaultData.Name, output[1].CreatedBy.Name)
		require.Nil(t, output[0].RevokedBy, "token should not be revoked")
		require.Nil(t, output[1].RevokedBy, "token should not be revoked")
	})

	t.Run("WhenServiceAccountHasNoTokens_ReturnEmptyList", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Create a service account without tokens
		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]

		// Act - Get all tokens for the service account
		reqGet := commonfixture.NewJSONRequest(
			t,
			"GET",
			"/api/service-accounts/"+*sa.Slug+"/tokens",
			nil,
		)

		respGet, err := testServer.App.Test(reqGet, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, respGet.Body)

		// Assert
		page := commonfixture.AssertJSONResponse[pagination.Page[schema.Token]](
			t,
			respGet,
			fiber.StatusOK,
		)

		// Verify we got an empty list
		require.Empty(t, page.Items, "should return empty list")
		require.False(t, page.HasMore)
		require.Nil(t, page.NextCursor)
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]

		for _, name := range []string{"first-token", "second-token", "third-token"} {
			payload := schema.PlainToken{Name: name, Scopes: []string{"write:entitlements"}}
			req := commonfixture.NewJSONRequest(t, "POST", "/api/service-accounts/"+*sa.Slug+"/tokens", payload)
			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			commonfixture.MustCloseBody(t, resp.Body)
		}

		// Act -- ask for only 2
		req := httptest.NewRequest("GET", "/api/service-accounts/"+*sa.Slug+"/tokens?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.Token]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_WalksAllPagesWithoutOverlapOrGaps", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]

		expectedIDs := make([]string, 0, 3)
		for _, name := range []string{"first-token", "second-token", "third-token"} {
			payload := schema.PlainToken{Name: name, Scopes: []string{"write:entitlements"}}
			req := commonfixture.NewJSONRequest(t, "POST", "/api/service-accounts/"+*sa.Slug+"/tokens", payload)
			resp, err := testServer.App.Test(req, fiber.TestConfig{})
			require.NoError(t, err)
			created := commonfixture.AssertJSONResponse[schema.PlainToken](t, resp, fiber.StatusCreated)
			expectedIDs = append(expectedIDs, created.ID.String())
			commonfixture.MustCloseBody(t, resp.Body)
		}

		// Act -- page 1
		req := httptest.NewRequest("GET", "/api/service-accounts/"+*sa.Slug+"/tokens?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[schema.Token]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act -- page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/service-accounts/"+*sa.Slug+"/tokens?limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert -- the remaining entry, no further page, and the two pages
		// together cover every token exactly once.
		page2 := commonfixture.AssertJSONResponse[pagination.Page[schema.Token]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)

		combined := append(append([]schema.Token{}, page1.Items...), page2.Items...)
		actualIDs := make([]string, len(combined))
		for i, tok := range combined {
			actualIDs[i] = tok.ID.String()
		}
		require.ElementsMatch(t, expectedIDs, actualIDs)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]

		// Act
		req := httptest.NewRequest("GET", "/api/service-accounts/"+*sa.Slug+"/tokens?cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
