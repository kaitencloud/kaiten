package identity_test

import (
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createtokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestCreateTokenOnServiceAccount(t *testing.T) {
	t.Run("WhenRequestIsValid_CreateToken", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]

		expireAt := time.Now().Add(24 * time.Hour)
		payload := createtokenonserviceaccount.Request{
			Body: schema.PlainToken{
				Name:      "test-token",
				Scopes:    []string{"write:entitlements"},
				ExpiresAt: &expireAt,
			},
		}

		req := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/service-accounts/"+*sa.Slug+"/tokens",
			payload.Body,
		)

		// Act
		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		// Assert
		output := commonfixture.AssertJSONResponse[schema.PlainToken](
			t,
			resp,
			fiber.StatusCreated,
		)

		// Check the format of the returned token
		require.NotEmpty(t, output.Value, "token should not be empty")
		require.Contains(t, output.Value, "ksh_", "token should start with prefix")
		require.Equal(
			t,
			len("ksh_")+32,
			len(output.Value),
			"token should have correct length (prefix + 32 chars)",
		)
		require.Equal(t, payload.Body.Name, output.Name)
		require.NotEmpty(t, output.CreatedBy.Name, "name of creator should not be empty")
		require.Equal(t, testDb.DefaultData.Name, output.CreatedBy.Name)
		require.Nil(t, output.RevokedBy, "token should not be revoked")
	})

	t.Run("WhenServiceAccountDoesNotExist_Returns404", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		expireAt := time.Now().Add(24 * time.Hour)
		payload := createtokenonserviceaccount.Request{
			Body: schema.PlainToken{
				Name:      "missing-service-account-token",
				Scopes:    []string{"write:entitlements"},
				ExpiresAt: &expireAt,
			},
		}

		req := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/service-accounts/missing-service-account/tokens",
			payload.Body,
		)

		resp, err := testServer.App.Test(req, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, resp.Body)

		require.Equal(t, fiber.StatusNotFound, resp.StatusCode)
	})
}
