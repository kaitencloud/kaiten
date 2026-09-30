package platformapi_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/jwtutil"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// This file is the boundary asserted with REAL credentials rather than stubs.

// realAuthServer builds a server whose authenticators are the production ones. It
// passes no PlatformAuth, so the server constructs the real platform authenticator
// from the application -- which is the only way to get one wired to the identity
// module's shared credential cache.
func realAuthServer(t *testing.T) *tests.TestServer {
	t.Helper()

	return tests.NewTestServer(testDb, tests.TestServerOptions{UseJWTAuth: true})
}

// TestARealPlatformCredentialAuthenticatesOnlyOnThePlatformListener is the
// property the two-listener split exists to guarantee, on one credential and two
// ports.
func TestARealPlatformCredentialAuthenticatesOnlyOnThePlatformListener(t *testing.T) {
	server := realAuthServer(t)
	authorization := map[string]string{"Authorization": "Bearer " + platformTokenPlaintext}

	t.Run("the public listener refuses it", func(t *testing.T) {
		for _, path := range []string{"/api/service-accounts", "/api/customers", "/api/releases"} {
			request := commonfixture.NewJSONRequest(t, http.MethodGet, path, nil, authorization)

			response, err := server.App.Test(request, fiber.TestConfig{})
			require.NoError(t, err)
			defer commonfixture.MustCloseBody(t, response.Body)

			require.Equal(t, http.StatusUnauthorized, response.StatusCode,
				"GET %s accepted a platform credential on the public listener", path)
		}
	})

	t.Run("the internal listener accepts it", func(t *testing.T) {
		request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/platform/me", nil, authorization)

		response, err := server.PlatformApp.Test(request, fiber.TestConfig{})
		require.NoError(t, err)
		defer commonfixture.MustCloseBody(t, response.Body)

		body := commonfixture.AssertJSONResponse[platformCredential](t, response, http.StatusOK)
		require.Equal(t, platformTokenID, body.ID,
			"the Platform listener authenticated a different credential than the one presented")
	})
}

// TestTheCoreExchangeRefusesAPlatformCredential is the split stated at the one
// place the two families used to meet.
func TestTheCoreExchangeRefusesAPlatformCredential(t *testing.T) {
	server := realAuthServer(t)

	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/tokens/validate", nil,
		map[string]string{"Authorization": "Bearer " + platformTokenPlaintext})

	response, err := server.App.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	require.Equal(t, http.StatusUnauthorized, response.StatusCode,
		"the Core exchange minted something for a platform credential")
	require.Empty(t, response.Header.Get("Authorization"),
		"a refused exchange must not hand back an internal JWT")
}

// TestThePlatformListenerStillValidatesTheCredential is what keeps the first test
// from being read as "the internal port trusts whatever reaches it". Being
// unroutable from outside is a second control; the credential still has to be a
// live row.
//
// The forgery here is the interesting shape: correctly prefixed and correctly
// formed, so nothing about it is distinguishable from a real credential until the
// database says otherwise. That is the check that replaced the signature.
func TestThePlatformListenerStillValidatesTheCredential(t *testing.T) {
	server := realAuthServer(t)

	forged, err := randomPlatformCredential()
	require.NoError(t, err)

	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/platform/me", nil,
		map[string]string{"Authorization": "Bearer " + forged})

	response, err := server.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	require.Equal(t, http.StatusUnauthorized, response.StatusCode,
		"the Platform listener accepted a credential that is in no table")
}

// TestAStaleInternalJWTIsRefusedByThePlatformListener covers the callers this
// change breaks on purpose.
//
// A platform caller mid-rollout may still be holding an internal JWT minted by the
// old exchange -- correctly signed, unexpired, and until now the only thing this
// listener accepted. It is refused, and refused as the WRONG CLASS rather than as
// a bad credential, because that is what it is: this surface takes `ksm_` and a
// JWT is not one. There is nothing left in the process that verifies it.
func TestAStaleInternalJWTIsRefusedByThePlatformListener(t *testing.T) {
	server := realAuthServer(t)

	stale, err := jwtutil.SignHS256([]byte("the-key-the-old-exchange-signed-with"), jwt.MapClaims{
		"sub":                      "system:kaiten",
		"kaiten_credential_kind":   string(principal.KindPlatform),
		"kaiten_platform_token_id": platformTokenID.String(),
		"scopes":                   scope.AllScopes(),
		"iat":                      time.Now().Unix(),
		"exp":                      time.Now().Add(time.Hour).Unix(),
	})
	require.NoError(t, err)

	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/platform/me", nil,
		map[string]string{"Authorization": "Bearer " + stale})

	response, err := server.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	body := commonfixture.AssertJSONResponse[map[string]any](t, response, http.StatusForbidden)
	require.Equal(t, principal.ErrCodeWrongCredentialKind, body["code"])
}

// TestAnOrganizationCredentialIsRefusedByThePlatformListener is the same assertion
// from the other side, with a real credential rather than a stub: an ordinary
// tenant credential is refused here on its prefix, before any lookup, so this
// listener never touches the tenant token table at all.
func TestAnOrganizationCredentialIsRefusedByThePlatformListener(t *testing.T) {
	server := realAuthServer(t)

	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/platform/me", nil,
		map[string]string{"Authorization": "Bearer " + token.PrefixOrganization + uuid.NewString()})

	response, err := server.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	body := commonfixture.AssertJSONResponse[map[string]any](t, response, http.StatusForbidden)
	require.Equal(t, principal.ErrCodeWrongCredentialKind, body["code"],
		"the Platform listener refused an organization credential for some other reason")
}
