package identity_test

import (
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	identitydb "github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetServiceAccounts(t *testing.T) {
	t.Run("WhenRequestIsValid_ReturnsAllServiceAccounts", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		saCount := 5
		sas, err := createSAS(t, saCount, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Len(t, sas, saCount)
		otherOrgID, err := createOrganization(t)
		require.NoError(t, err)
		otherOrganizationSa, err := createSA(t, "other-organization-sa", "other-organization-sa-external-id", otherOrgID)
		require.NoError(t, err)

		req := commonfixture.NewJSONRequest(t, "GET", "/api/service-accounts", nil)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		page := commonfixture.AssertJSONResponse[pagination.Page[schema.ServiceAccount]](t, resp, fiber.StatusOK)
		result := page.Items
		require.Len(t, result, saCount)
		require.False(t, page.HasMore)

		saMap := make(map[string]*identitydb.CreateServiceAccountRow)
		for _, sa := range sas {
			saMap[sa.ID.String()] = sa
		}

		for _, returnedSA := range result {
			require.NotEqual(t, otherOrganizationSa.ID.String(), returnedSA.ID.String())
			original, exists := saMap[returnedSA.ID.String()]
			require.True(t, exists)
			require.Equal(t, original.Name, returnedSA.Name)
			require.Equal(t, original.ExternalID, returnedSA.ExternalID)
			require.NotNil(t, returnedSA.CreatedBy)
			require.Equal(t, *original.CreatedByID, returnedSA.CreatedBy.ID)
			require.NotNil(t, returnedSA.Tokens, "tokens should not be nil")
			require.Empty(t, returnedSA.Tokens, "tokens should be empty array")
		}
	})

	t.Run("WhenServiceAccountsHaveTokens_ReturnsServiceAccountsWithTokens", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Create 2 service accounts
		sas, err := createSAS(t, 2, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		require.Len(t, sas, 2)

		sa1 := sas[0]
		sa2 := sas[1]

		// Create 2 tokens for sa1
		token1Payload := schema.PlainToken{
			Name:   "first-token",
			Scopes: []string{"write:entitlements"},
		}
		token2Payload := schema.PlainToken{
			Name:   "second-token",
			Scopes: []string{"write:licenses"},
		}

		req1 := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/service-accounts/"+*sa1.Slug+"/tokens",
			token1Payload,
		)
		resp1, err := testServer.App.Test(req1, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp1.Body)
		commonfixture.AssertJSONResponse[schema.PlainToken](t, resp1, fiber.StatusCreated)

		req2 := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/service-accounts/"+*sa1.Slug+"/tokens",
			token2Payload,
		)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)
		commonfixture.AssertJSONResponse[schema.PlainToken](t, resp2, fiber.StatusCreated)

		// Create 1 token for sa2
		req3 := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/service-accounts/"+*sa2.Slug+"/tokens",
			token1Payload,
		)
		resp3, err := testServer.App.Test(req3, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp3.Body)
		commonfixture.AssertJSONResponse[schema.PlainToken](t, resp3, fiber.StatusCreated)

		// Act - Get all service accounts
		req := commonfixture.NewJSONRequest(t, "GET", "/api/service-accounts", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		page := commonfixture.AssertJSONResponse[pagination.Page[schema.ServiceAccount]](t, resp, fiber.StatusOK)
		result := page.Items
		require.Len(t, result, 2)

		// Find sa1 and sa2 in results
		var resultSa1, resultSa2 *schema.ServiceAccount
		for i := range result {
			if result[i].ID == sa1.ID {
				resultSa1 = &result[i]
			}
			if result[i].ID == sa2.ID {
				resultSa2 = &result[i]
			}
		}

		require.NotNil(t, resultSa1, "sa1 should be in results")
		require.NotNil(t, resultSa2, "sa2 should be in results")

		// Verify sa1 has 2 tokens
		require.NotNil(t, resultSa1.Tokens, "sa1 tokens should not be nil")
		require.Len(t, resultSa1.Tokens, 2, "sa1 should have 2 tokens")
		for _, token := range resultSa1.Tokens {
			require.Equal(t, sa1.ID, token.ServiceAccountID)
			require.Contains(t, []string{"write:entitlements", "write:licenses"}, token.Scopes[0])
			require.Equal(t, testDb.DefaultData.Name, token.CreatedBy.Name)
			require.Nil(t, token.RevokedBy, "token should not be revoked")
		}

		// Verify sa2 has 1 token
		require.NotNil(t, resultSa2.Tokens, "sa2 tokens should not be nil")
		require.Len(t, resultSa2.Tokens, 1, "sa2 should have 1 token")
		require.Equal(t, sa2.ID, resultSa2.Tokens[0].ServiceAccountID)
		require.Equal(t, token1Payload.Name, resultSa2.Tokens[0].Name)
		require.Equal(t, []string{"write:entitlements"}, resultSa2.Tokens[0].Scopes)
		require.Equal(t, testDb.DefaultData.Name, resultSa2.Tokens[0].CreatedBy.Name)
		require.Nil(t, resultSa2.Tokens[0].RevokedBy, "token should not be revoked")
	})

	t.Run("PaginationLimit_LimitsResultsAndReportsHasMore", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		_, err := createSAS(t, 3, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		// Act -- ask for only 2
		req := httptest.NewRequest("GET", "/api/service-accounts?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		actual := commonfixture.AssertJSONResponse[pagination.Page[schema.ServiceAccount]](t, resp, fiber.StatusOK)
		require.Len(t, actual.Items, 2)
		require.True(t, actual.HasMore)
		require.NotNil(t, actual.NextCursor)
	})

	t.Run("PaginationCursor_WalksAllPagesWithoutOverlapOrGaps", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		created, err := createSAS(t, 3, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		expectedIDs := make([]string, len(created))
		for i, sa := range created {
			expectedIDs[i] = sa.ID.String()
		}

		// Act -- page 1
		req := httptest.NewRequest("GET", "/api/service-accounts?limit=2", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		page1 := commonfixture.AssertJSONResponse[pagination.Page[schema.ServiceAccount]](t, resp, fiber.StatusOK)
		commonfixture.MustCloseBody(t, resp.Body)
		require.Len(t, page1.Items, 2)
		require.True(t, page1.HasMore)
		require.NotNil(t, page1.NextCursor)

		// Act -- page 2, following the cursor from page 1
		req2 := httptest.NewRequest("GET", "/api/service-accounts?limit=2&cursor="+url.QueryEscape(*page1.NextCursor), nil)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)

		// Assert -- the remaining entry, no further page, and the two pages
		// together cover every service account exactly once.
		page2 := commonfixture.AssertJSONResponse[pagination.Page[schema.ServiceAccount]](t, resp2, fiber.StatusOK)
		require.Len(t, page2.Items, 1)
		require.False(t, page2.HasMore)
		require.Nil(t, page2.NextCursor)

		combined := append(append([]schema.ServiceAccount{}, page1.Items...), page2.Items...)
		actualIDs := make([]string, len(combined))
		for i, sa := range combined {
			actualIDs[i] = sa.ID.String()
		}
		require.ElementsMatch(t, expectedIDs, actualIDs)
	})

	t.Run("InvalidCursor_ReturnsBadRequest", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		// Act
		req := httptest.NewRequest("GET", "/api/service-accounts?cursor=not-a-valid-cursor", nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
	})
}
