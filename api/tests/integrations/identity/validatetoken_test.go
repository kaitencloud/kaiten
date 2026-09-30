package identity_test

import (
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/createtokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

func TestValidateTokenOnServiceAccount(t *testing.T) {
	t.Run("WhenRequestIsValid_CreateToken", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]

		expireAt := time.Now().Add(24 * time.Hour)
		payload := createtokenonserviceaccount.Request{
			Body: schema.PlainToken{
				Scopes:    []string{"write:entitlements"},
				ExpiresAt: &expireAt,
			},
		}

		tokenReq := commonfixture.NewJSONRequest(
			t,
			"POST",
			"/api/service-accounts/"+*sa.Slug+"/tokens",
			payload.Body,
		)
		tokenResp, err := testServer.App.Test(tokenReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, tokenResp.Body)
		output := commonfixture.AssertJSONResponse[schema.PlainToken](
			t,
			tokenResp,
			fiber.StatusCreated,
		)

		validateReq := commonfixture.NewJSONRequest(
			t,
			"GET",
			"/api/tokens/validate",
			payload.Body,
			map[string]string{
				"Authorization": fmt.Sprintf("Bearer %s", output.Value),
			},
		)

		// Act
		validateResp, err := testServer.App.Test(validateReq, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, tokenResp.Body)

		// Assert
		// 200, not 204: Envoy's ext_authz allows a request through on an
		// exact 200 only (see validatetoken.RegisterEndpoint).
		require.Equal(t, http.StatusOK, validateResp.StatusCode)
		authHeader := validateResp.Header.Get("Authorization")
		require.NotEmpty(t, authHeader, "Authorization header should be set")
		require.Contains(t, authHeader, "Bearer ")
		jwtToken := authHeader[len("Bearer "):]
		require.NotEmpty(t, jwtToken, "JWT token should not be empty")

		token, _, err := jwt.NewParser().ParseUnverified(jwtToken, jwt.MapClaims{})
		require.NoError(t, err, "JWT should be parseable")

		claims, ok := token.Claims.(jwt.MapClaims)
		require.True(t, ok, "claims should be MapClaims")

		sub, ok := claims["sub"].(string)
		require.True(t, ok, "sub claim should be present and be a string")
		require.Equal(t, sa.ExternalID, sub, "sub should match service account external ID")

		externalOrgID, ok := claims["kaiten_external_org_id"].(string)
		require.True(t, ok, "kaiten_external_org_id claim should be present and be a string")
		require.Equal(t, "organization-external-1", externalOrgID, "kaiten_external_org_id should match organization external ID")

		require.Nil(t, claims["kaiten_user_id"], "kaiten_user_id claim should no longer be present")
		require.Nil(t, claims["kaiten_org_id"], "kaiten_org_id claim should no longer be present")
		require.Nil(t, claims["org_id"], "org_id claim should no longer be present")

		scopesInterface, ok := claims["scopes"].([]any)
		require.True(t, ok, "scopes claim should be present and be an array")
		require.Len(t, scopesInterface, len(payload.Body.Scopes), "scopes should have the same length")

		// Convert []any to []string for the comparison
		scopes := make([]string, len(scopesInterface))
		for i, scope := range scopesInterface {
			scopes[i], ok = scope.(string)
			require.True(t, ok, "each scope should be a string")
		}

		for _, scope := range scopes {
			require.Contains(t, payload.Body.Scopes, scope, "scope should be in the original scopes")
		}
	})

	t.Run("WhenServiceAccountIsSoftDeleted_RejectsToken", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]
		plainToken := createToken(t, *sa.Slug)

		_, err = testServer.Dependencies.DB.Exec(t.Context(),
			`UPDATE "user" SET deleted_at = now() WHERE id = $1`, sa.ID)
		require.NoError(t, err)

		// Act
		// The token is validated for the FIRST time only after the soft
		// delete: ValidateToken caches positive results in memory, so a
		// prior validation would answer from the cache and prove nothing
		// about the query.
		validateResp := validateToken(t, plainToken)
		defer commonfixture.MustCloseBody(t, validateResp.Body)

		// Assert
		require.Equal(t, http.StatusUnauthorized, validateResp.StatusCode)
	})

	// Deleting an organization is a hard cascade, so the query needs no
	// liveness predicate on it: token.organization_id is ON DELETE CASCADE,
	// which takes the token, its service account and the whole tenant away.
	t.Run("WhenOrganizationIsDeleted_RejectsToken", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		plainToken := createToken(t, *sas[0].Slug)

		_, err = testServer.Dependencies.DB.Exec(t.Context(),
			`DELETE FROM organization WHERE id = $1`, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)

		var remainingTokens int
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
			`SELECT count(*) FROM token WHERE organization_id = $1`, testDb.DefaultData.OrganizationID).Scan(&remainingTokens))
		require.Zero(t, remainingTokens, "tokens must not outlive their organization")

		// Act
		validateResp := validateToken(t, plainToken)
		defer commonfixture.MustCloseBody(t, validateResp.Body)

		// Assert
		require.Equal(t, http.StatusUnauthorized, validateResp.StatusCode)
	})

	t.Run("WhenTwoActiveTokensShareALookupHash_TheWriteIsRejected", func(t *testing.T) {
		// Arrange
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

		sas, err := createSAS(t, 1, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		sa := sas[0]
		createToken(t, *sa.Slug)

		var lookupHash string
		require.NoError(t, testServer.Dependencies.DB.QueryRow(t.Context(),
			`SELECT lookup_hash FROM token WHERE service_account_id = $1`, sa.ID).Scan(&lookupHash))

		// Act
		// lookup_hash is what resolves a PAT to an identity, and the query
		// is :one -- a second active row with the same value would make the
		// exchange answer as an arbitrary one of two identities.
		_, err = testServer.Dependencies.DB.Exec(t.Context(), `
			INSERT INTO token (name, slug, hash, lookup_hash, created_by, service_account_id, organization_id)
			VALUES ('duplicate', 'duplicate-token', 'a-different-bcrypt-digest', $1, $2, $3, $4)
		`, lookupHash, testDb.DefaultData.UserID, sa.ID, testDb.DefaultData.OrganizationID)

		// Assert
		require.Error(t, err)
		require.True(t, kaitenerrors.IsUniqueViolation(err), "expected a unique violation, got %v", err)
	})
}

// createToken mints a PAT on the given service account through the API and
// returns its plaintext value.
func createToken(t *testing.T, serviceAccountSlug string) string {
	t.Helper()

	expireAt := time.Now().Add(24 * time.Hour)
	req := commonfixture.NewJSONRequest(t, "POST", "/api/service-accounts/"+serviceAccountSlug+"/tokens", schema.PlainToken{
		Scopes:    []string{"write:entitlements"},
		ExpiresAt: &expireAt,
	})

	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	return commonfixture.AssertJSONResponse[schema.PlainToken](t, resp, fiber.StatusCreated).Value
}

func validateToken(t *testing.T, plainToken string) *http.Response {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, "GET", "/api/tokens/validate", nil, map[string]string{
		"Authorization": fmt.Sprintf("Bearer %s", plainToken),
	})

	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)

	return resp
}
