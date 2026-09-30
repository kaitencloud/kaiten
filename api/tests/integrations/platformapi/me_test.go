package platformapi_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	identitydb "github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// platformCredential mirrors schema.PlatformCredential, but as its own struct
// rather than an import of it. The point of these tests is the wire contract a
// client sees, and unmarshalling into the server's own type would let a renamed
// json tag pass unnoticed.
type platformCredential struct {
	ID             uuid.UUID `json:"id"`
	Name           string    `json:"name"`
	Slug           string    `json:"slug"`
	Subject        string    `json:"subject"`
	CredentialKind string    `json:"credentialKind"`
	Scopes         []string  `json:"scopes"`
	ExpiresAt      *string   `json:"expiresAt"`
	CreatedAt      string    `json:"createdAt"`
}

func TestPlatformMeDescribesTheCallingCredential(t *testing.T) {
	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/platform/me", nil)

	response, err := platformServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	body := commonfixture.AssertJSONResponse[platformCredential](t, response, http.StatusOK)

	require.Equal(t, platformTokenID, body.ID,
		"/platform/me described a credential other than the one presented")
	require.Equal(t, "boundary-suite", body.Name)
	require.Equal(t, platformidentity.ExternalID, body.Subject)
	require.Equal(t, string(principal.KindPlatform), body.CredentialKind)
	require.ElementsMatch(t, scope.AllScopes(), body.Scopes)
	require.Nil(t, body.ExpiresAt, "the fixture credential is non-expiring")
	require.NotEmpty(t, body.CreatedAt)
}

// TestPlatformMeNeverReturnsASecret is asserted against the raw JSON rather than
// the decoded struct, because a struct can only fail to have a field -- it cannot
// notice one. Every value here existed in plaintext exactly once, at creation.
func TestPlatformMeNeverReturnsASecret(t *testing.T) {
	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/platform/me", nil)

	response, err := platformServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	var raw map[string]json.RawMessage
	require.NoError(t, json.NewDecoder(response.Body).Decode(&raw))

	for _, forbidden := range []string{"value", "token", "hash", "lookupHash", "plainToken", "secret"} {
		require.NotContains(t, raw, forbidden,
			"/platform/me published %q", forbidden)
	}
}

// TestPlatformMeIsNotAnEnumerationEndpoint states the shape guarantee as a test:
// the request has no parameters at all, so a credential can only ever describe
// itself. Sending the id of a *different*, live platform credential as a query
// parameter must change nothing.
func TestPlatformMeIsNotAnEnumerationEndpoint(t *testing.T) {
	other, _, err := createPlatformToken("someone-elses-credential-"+uuid.NewString(), []string{"read:tokens"})
	require.NoError(t, err)

	request := commonfixture.NewJSONRequest(t, http.MethodGet,
		"/api/platform/me?id="+other.String()+"&tokenId="+other.String(), nil)

	response, err := platformServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	body := commonfixture.AssertJSONResponse[platformCredential](t, response, http.StatusOK)
	require.Equal(t, platformTokenID, body.ID,
		"a query parameter redirected /platform/me at another credential")
}

// TestPlatformMeRejectsARevokedCredential covers the window the handler's comment
// describes: the credential authenticated at the gateway, and was revoked before
// the request reached the handler. In production that window is short; here it is
// made deterministic by revoking the row and then calling with its id.
//
// 401 rather than 404 is the contract -- the answer is about the caller's own
// credential, so "not found" would be describing the wrong thing.
func TestPlatformMeRejectsARevokedCredential(t *testing.T) {
	name := "revoked-" + uuid.NewString()
	revokedID, _, err := createPlatformToken(name, []string{"read:tokens"})
	require.NoError(t, err)

	// Revoked through the production query, so this test also proves that query
	// reaches a row created by the production creation query.
	revoked, err := identitydb.New(testDb.DbPool).RevokePlatformTokenByName(t.Context(), name)
	require.NoError(t, err)
	require.Equal(t, revokedID, revoked.ID)

	revokedServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformCredential: true,
		PlatformTokenID:    revokedID,
	})

	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/platform/me", nil)

	response, err := revokedServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	body := commonfixture.AssertJSONResponse[map[string]any](t, response, http.StatusUnauthorized)
	require.Equal(t, "PlatformCredential.Revoked", body["code"])
}

// TestPlatformMeRejectsAnUnknownCredential is the same path reached differently:
// a principal carrying an id that never existed. It shares the revoked
// credential's answer on purpose -- distinguishing "revoked" from "never existed"
// would tell a caller whether an id was ever issued.
func TestPlatformMeRejectsAnUnknownCredential(t *testing.T) {
	unknownServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformCredential: true,
		PlatformTokenID:    uuid.New(),
	})

	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/platform/me", nil)

	response, err := unknownServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	body := commonfixture.AssertJSONResponse[map[string]any](t, response, http.StatusUnauthorized)
	require.Equal(t, "PlatformCredential.Revoked", body["code"])
}
