package identity_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestGetServiceAccount(t *testing.T) {
	t.Run("WhenRequestIsValid_GetServiceAccount", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]
		req := commonfixture.NewJSONRequest(t, "GET", "/api/service-accounts/"+*sa.Slug, nil)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		existing := commonfixture.AssertJSONResponse[schema.ServiceAccount](t, resp, fiber.StatusOK)
		require.Equal(t, sa.Name, existing.Name)
		require.Equal(t, sa.ID, existing.ID)
		require.Equal(t, sa.ExternalID, existing.ExternalID)
		require.NotNil(t, existing.CreatedBy)
		require.Equal(t, *sa.CreatedByID, existing.CreatedBy.ID)
		require.NotNil(t, existing.Tokens, "tokens should not be nil")
		require.Empty(t, existing.Tokens, "tokens should be empty array")
	})

	t.Run("WhenServiceAccountIsOnAnotherOrganization_Returns404", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		otherOrgID, err := createOrganization(t)
		require.NoError(t, err)
		otherOrganizationSa, err := createSA(t, "other-organization-sa", "other-organization-sa-external-id", otherOrgID)
		require.NoError(t, err)

		req := commonfixture.NewJSONRequest(t, "GET", "/api/service-accounts/"+*otherOrganizationSa.Slug, nil)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})

	t.Run("WhenServiceAccountHasTokens_ReturnsTokensArray", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]

		// Create 2 tokens for this service account
		expireAt := time.Now().Add(time.Hour * 24)
		token1Payload := schema.PlainToken{
			Name:      "first-token",
			Scopes:    []string{"write:entitlements"},
			ExpiresAt: &expireAt,
		}
		token2Payload := schema.PlainToken{
			Name:      "second-token",
			Scopes:    []string{"write:licenses"},
			ExpiresAt: nil,
		}

		// Create first token
		req1 := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/service-accounts/"+*sa.Slug+"/tokens",
			token1Payload,
		)
		resp1, err := testServer.App.Test(req1, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp1.Body)
		token1 := commonfixture.AssertJSONResponse[schema.PlainToken](t, resp1, fiber.StatusCreated)

		// Create second token
		req2 := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/service-accounts/"+*sa.Slug+"/tokens",
			token2Payload,
		)
		resp2, err := testServer.App.Test(req2, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp2.Body)
		token2 := commonfixture.AssertJSONResponse[schema.PlainToken](t, resp2, fiber.StatusCreated)

		// Act - Get the service account
		req := commonfixture.NewJSONRequest(t, "GET", "/api/service-accounts/"+*sa.Slug, nil)
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		existing := commonfixture.AssertJSONResponse[schema.ServiceAccount](t, resp, fiber.StatusOK)
		require.Equal(t, sa.Name, existing.Name)
		require.Equal(t, sa.ID, existing.ID)
		require.NotNil(t, existing.Tokens, "tokens should not be nil")
		require.Len(t, existing.Tokens, 2, "should have 2 tokens")

		// Verify tokens content (sorted by created_at DESC, so token2 should be first)
		require.Equal(t, token2.ID, existing.Tokens[0].ID)
		require.Equal(t, token2.Name, existing.Tokens[0].Name)
		require.Equal(t, token2.Scopes, existing.Tokens[0].Scopes)
		require.Nil(t, existing.Tokens[0].ExpiresAt)
		require.Equal(t, sa.ID, existing.Tokens[0].ServiceAccountID)
		require.Equal(t, testDb.DefaultData.Name, existing.Tokens[0].CreatedBy.Name)
		require.Nil(t, existing.Tokens[0].RevokedBy, "token should not be revoked")

		require.Equal(t, token1.ID, existing.Tokens[1].ID)
		require.Equal(t, token1.Name, existing.Tokens[1].Name)
		require.Equal(t, token1.Scopes, existing.Tokens[1].Scopes)
		require.NotNil(t, existing.Tokens[1].ExpiresAt)
		require.Equal(t, sa.ID, existing.Tokens[1].ServiceAccountID)
		require.Equal(t, testDb.DefaultData.Name, existing.Tokens[1].CreatedBy.Name)
		require.Nil(t, existing.Tokens[1].RevokedBy, "token should not be revoked")
	})
}
