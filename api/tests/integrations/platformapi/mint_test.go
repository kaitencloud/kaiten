package platformapi_test

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/mintorganizationtoken"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/platform/targetorg"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
	"github.com/kaitencloud/kaiten/api/pkg/scope"
	"github.com/kaitencloud/kaiten/api/tests"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

// No test in this file resets the database, and it does not need to: each one
// mints into an organization it created itself, so nothing it writes is
// reachable from another test -- the token table's uniqueness constraints are
// all scoped by organization_id.
//
// A test that does need a reset must call resetDatabase (fixture_test.go)
// rather than testDb.Reset directly, which would drop the platform credential
// row out from under everything that runs after it.

// TestMintedTokenIsAnOrdinaryOrganizationCredential is the central claim of the
// whole design, asserted end to end: a platform credential acting inside a tenant
// does not become org-scoped -- it produces a separate, ordinary organization
// token, and *that* is what reaches the Core API.
//
// The prefix assertion is the load-bearing one. If this ever returned a ksm_
// value, the Platform API would be handing out platform authority instead of
// delegating a bounded slice of it.
func TestMintedTokenIsAnOrdinaryOrganizationCredential(t *testing.T) {
	organizationID := createOrganization(t)

	minted := mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "ordinary", Scopes: nil, TTL: ""})

	require.True(t, strings.HasPrefix(minted.Value, token.PrefixOrganization),
		"the mint returned something other than an organization credential")
	require.False(t, strings.HasPrefix(minted.Value, token.PrefixPlatform),
		"the mint returned a platform credential")
	require.NotEmpty(t, minted.Slug, "no slug was published, so the credential cannot be revoked early")

	// The response is schema.PlainToken -- the same component a service-account
	// token creation returns -- so the owner is reported the way every other token
	// reports one: as the membership that holds it. For this credential that is
	// system:kaiten's membership in the target.
	require.Equal(t, platformidentity.ID, minted.ServiceAccountID,
		"the minted credential is not owned by the platform identity")
	require.Equal(t, platformidentity.ID, minted.CreatedBy.ID,
		"createdBy was not resolved to system:kaiten's membership in the target")
	require.NotEmpty(t, minted.CreatedBy.Name, "createdBy carries no display name")
	require.Nil(t, minted.RevokedAt)
	require.Nil(t, minted.RevokedBy)

	// The tenant the credential acts inside is the {orgId} in the path, so the
	// response does not repeat it. The row is what has to agree.
	var storedOrganizationID uuid.UUID
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT organization_id FROM token WHERE id = $1`, minted.ID).Scan(&storedOrganizationID))
	require.Equal(t, organizationID, storedOrganizationID,
		"the credential was minted into an organization other than the target")
}

// TestMintedTokenAuthenticatesInsideItsTenant carries the previous test's result
// through the unchanged /api/tokens/validate path. The JWT it mints is the proof
// that nothing about the way this credential was issued follows it: an unsigned
// token, carrying the target's external id, resolved by JIT to the pre-existing
// system:kaiten row.
func TestMintedTokenAuthenticatesInsideItsTenant(t *testing.T) {
	organizationID := createOrganization(t)
	externalID := organizationExternalID(t, organizationID)

	minted := mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{
			Name:   "authenticates",
			Scopes: []string{scope.Read(scope.Customers)},
			TTL:    "",
		})

	request := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/tokens/validate", nil,
		map[string]string{"Authorization": "Bearer " + minted.Value})
	response, err := platformServer.App.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	require.Equal(t, http.StatusOK, response.StatusCode,
		"a credential this API just minted did not validate")

	claims := parseUnverifiedClaims(t, response.Header.Get("Authorization"))
	require.Equal(t, platformidentity.ExternalID, claims["sub"])
	require.Equal(t, externalID, claims["kaiten_external_org_id"],
		"the minted credential authenticated somewhere other than its target")
	require.Nil(t, claims["kaiten_credential_kind"],
		"a minted organization credential must not carry a platform credential kind")
}

// TestMintWithoutTTLDoesNotExpire pins decision 9's default. Omitting the TTL is
// not an oversight to be corrected with a server-side ceiling: it is the shape
// the dogfooding credential already has, bounded by revocation rather than by
// time.
func TestMintWithoutTTLDoesNotExpire(t *testing.T) {
	organizationID := createOrganization(t)

	minted := mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "no-ttl", Scopes: nil, TTL: ""})

	require.Nil(t, minted.ExpiresAt, "an omitted ttl produced an expiring credential")

	var storedExpiry *time.Time
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT expires_at FROM token WHERE id = $1`, minted.ID).Scan(&storedExpiry))
	require.Nil(t, storedExpiry, "expires_at was written for a credential that must not expire")
}

// TestMintWithTTLExpires is the other half, and it reaches into the row rather
// than trusting the response: the response could report an expiry the database
// does not enforce.
func TestMintWithTTLExpires(t *testing.T) {
	organizationID := createOrganization(t)
	before := time.Now().UTC()

	minted := mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "with-ttl", Scopes: nil, TTL: "2m"})

	require.NotNil(t, minted.ExpiresAt, "a ttl was requested and ignored")
	require.WithinDuration(t, before.Add(2*time.Minute), *minted.ExpiresAt, time.Minute)

	var storedExpiry *time.Time
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT expires_at FROM token WHERE id = $1`, minted.ID).Scan(&storedExpiry))
	require.NotNil(t, storedExpiry, "the response promised an expiry the row does not carry")
	require.WithinDuration(t, *minted.ExpiresAt, *storedExpiry, time.Second)
}

// TestMintRejectsAnUnparseableTTL keeps a typo from silently becoming a
// non-expiring credential, which is the failure mode that matters: "15" instead
// of "15m" must not mean forever.
func TestMintRejectsAnUnparseableTTL(t *testing.T) {
	organizationID := createOrganization(t)

	body := mintExpectingError(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "bad-ttl", Scopes: nil, TTL: "fifteen minutes"},
		http.StatusBadRequest)
	require.Equal(t, "MintOrganizationToken.InvalidTTL", body["code"])
}

// TestMintInheritsScopesWhenNoneRequested documents the bootstrap case: the
// common ask is "a credential that can do what I can do inside this tenant".
func TestMintInheritsScopesWhenNoneRequested(t *testing.T) {
	organizationID := createOrganization(t)
	narrowScopes := []string{scope.Write(scope.Tokens), scope.Read(scope.Customers)}

	narrowServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformCredential: true,
		PlatformTokenID:    platformTokenID,
		Scopes:             narrowScopes,
	})

	minted := mintAsPlatform(t, narrowServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "inherited", Scopes: nil, TTL: ""})

	require.ElementsMatch(t, narrowScopes, minted.Scopes,
		"an omitted scope list did not inherit the calling credential's scopes")
}

// TestMintNarrowsScopes is the delegation half.
func TestMintNarrowsScopes(t *testing.T) {
	organizationID := createOrganization(t)

	minted := mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{
			Name:   "narrowed",
			Scopes: []string{scope.Read(scope.Customers)},
			TTL:    "",
		})

	require.Equal(t, []string{scope.Read(scope.Customers)}, minted.Scopes)
}

// TestMintRefusesToWidenScopes is the escalation test, and it is the one that
// distinguishes this surface from the Core API's own token creation, which
// validates well-formedness only (F2). A platform credential delegates a subset
// of its authority; it cannot manufacture more.
func TestMintRefusesToWidenScopes(t *testing.T) {
	organizationID := createOrganization(t)

	narrowServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformCredential: true,
		PlatformTokenID:    platformTokenID,
		Scopes:             []string{scope.Write(scope.Tokens)},
	})

	body := mintExpectingError(t, narrowServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{
			Name:   "widened",
			Scopes: []string{scope.Write(scope.Tokens), scope.Delete(scope.Organizations)},
			TTL:    "",
		},
		http.StatusForbidden)
	require.Equal(t, "MintOrganizationToken.ScopesExceedCredential", body["code"])

	var minted int
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT count(*) FROM token WHERE organization_id = $1`, organizationID).Scan(&minted))
	require.Zero(t, minted, "a refused mint still wrote a row")
}

// TestMintIntoAnUnknownOrganizationIs404 belongs here as well as in the
// target-organization suite: it is what stops the mint from being an existence
// oracle for organization uuids, and it must hold for the operation that actually
// writes.
func TestMintIntoAnUnknownOrganizationIs404(t *testing.T) {
	body := mintExpectingError(t, platformServer, uuid.New(),
		mintorganizationtoken.MintOrganizationTokenBody{Name: "nowhere", Scopes: nil, TTL: ""},
		http.StatusNotFound)
	require.Equal(t, targetorg.ErrCodeNotFound, body["code"])
}

// TestMintRefusesWhenTheSystemMembershipIsMissing proves the one thing the mint
// must never do: create the membership it needs. Reaching this state requires
// disabling the protect trigger, because no API path can produce it -- which is
// itself the reason the rejection is a 409 logged as a platform invariant breach
// rather than a client error.
func TestMintRefusesWhenTheSystemMembershipIsMissing(t *testing.T) {
	organizationID := createOrganization(t)
	softDeleteSystemMembership(t, organizationID)

	body := mintExpectingError(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "unmembered", Scopes: nil, TTL: ""},
		http.StatusConflict)
	require.Equal(t, "MintOrganizationToken.SystemMembershipMissing", body["code"])

	var revived int
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT count(*) FROM user_on_organization
		 WHERE organization_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
		organizationID, platformidentity.ID).Scan(&revived))
	require.Zero(t, revived, "the mint created the membership it was missing")
}

// TestMintRejectsADuplicateName keeps the caller's own label unique per tenant,
// and -- unlike a slug collision, which the server retries because the server
// chose the slug -- this one is the caller's to resolve.
func TestMintRejectsADuplicateName(t *testing.T) {
	organizationID := createOrganization(t)
	request := mintorganizationtoken.MintOrganizationTokenBody{Name: "twice", Scopes: nil, TTL: ""}

	mintAsPlatform(t, platformServer, organizationID, request)

	body := mintExpectingError(t, platformServer, organizationID, request, http.StatusConflict)
	require.Equal(t, "MintOrganizationToken.NameConflict", body["code"])
}

// TestMintRequiresItsScope: being a platform credential is one requirement,
// write:tokens is still the other.
func TestMintRequiresItsScope(t *testing.T) {
	organizationID := createOrganization(t)

	readOnlyServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformCredential: true,
		PlatformTokenID:    platformTokenID,
		Scopes:             []string{scope.Read(scope.Tokens)},
	})

	request := commonfixture.NewJSONRequest(t, http.MethodPost,
		"/api/platform/organizations/"+organizationID.String()+"/tokens",
		mintorganizationtoken.MintOrganizationTokenBody{Name: "unscoped", Scopes: nil, TTL: ""})
	response, err := readOnlyServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	require.Equal(t, http.StatusForbidden, response.StatusCode,
		"a platform credential without write:tokens minted a credential")
}

// TestMintIsRefusedForOrganizationCredentials closes the direction the whole
// surface exists to prevent: an organization credential -- even one owned by
// system:kaiten -- cannot mint on the platform's behalf.
func TestMintIsRefusedForOrganizationCredentials(t *testing.T) {
	organizationID := createOrganization(t)

	request := commonfixture.NewJSONRequest(t, http.MethodPost,
		"/api/platform/organizations/"+organizationID.String()+"/tokens",
		mintorganizationtoken.MintOrganizationTokenBody{Name: "escalation", Scopes: nil, TTL: ""})
	response, err := organizationServer.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	require.Equal(t, http.StatusForbidden, response.StatusCode,
		"an organization credential reached the mint")
}

// --- revocation ---------------------------------------------------------------

// TestRevokeRetiresTheMintedCredential is the early-exit path: a credential can
// be retired without retiring the platform credential that issued it.
func TestRevokeRetiresTheMintedCredential(t *testing.T) {
	organizationID := createOrganization(t)
	minted := mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "retire-me", Scopes: nil, TTL: ""})

	require.Equal(t, http.StatusNoContent,
		revokeAsPlatform(t, platformServer, organizationID, minted.Slug))

	var revokedDate *time.Time
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT revoked_date FROM token WHERE id = $1`, minted.ID).Scan(&revokedDate))
	require.NotNil(t, revokedDate, "the credential was reported revoked but the row is still active")

	// The credential is dead on the Core API too, immediately -- the point of the
	// cache eviction, not of waiting out a TTL.
	validate := commonfixture.NewJSONRequest(t, http.MethodGet, "/api/tokens/validate", nil,
		map[string]string{"Authorization": "Bearer " + minted.Value})
	response, err := platformServer.App.Test(validate, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)
	require.NotEqual(t, http.StatusOK, response.StatusCode,
		"a revoked credential still validated")
}

// TestRevokeIsIdempotentlyNotFound: the second revoke of the same slug reports
// the same miss as an unknown one. That single answer is deliberate -- see the
// handler -- because four distinguishable misses would be an enumeration oracle.
func TestRevokeIsIdempotentlyNotFound(t *testing.T) {
	organizationID := createOrganization(t)
	minted := mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "revoke-twice", Scopes: nil, TTL: ""})

	require.Equal(t, http.StatusNoContent,
		revokeAsPlatform(t, platformServer, organizationID, minted.Slug))
	require.Equal(t, http.StatusNotFound,
		revokeAsPlatform(t, platformServer, organizationID, minted.Slug))
	require.Equal(t, http.StatusNotFound,
		revokeAsPlatform(t, platformServer, organizationID, "system-kaiten-nonexistent"))
}

// TestRevokeCannotReachAnotherOrganizationsCredential: the slug is real and this
// credential issued it, but not here.
func TestRevokeCannotReachAnotherOrganizationsCredential(t *testing.T) {
	first := createOrganization(t)
	second := createOrganization(t)
	minted := mintAsPlatform(t, platformServer, first,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "elsewhere", Scopes: nil, TTL: ""})

	require.Equal(t, http.StatusNotFound,
		revokeAsPlatform(t, platformServer, second, minted.Slug))
	require.Equal(t, http.StatusNoContent,
		revokeAsPlatform(t, platformServer, first, minted.Slug),
		"the credential was not reachable through its own organization either")
}

// TestRevokeCannotReachAnotherPlatformCredentialsChild is the containment
// property: two platform credentials with identical scopes still cannot retire
// each other's issue. Without the issued_by_platform_token_id predicate, any
// platform credential could revoke every credential the platform ever minted.
func TestRevokeCannotReachAnotherPlatformCredentialsChild(t *testing.T) {
	organizationID := createOrganization(t)
	minted := mintAsPlatform(t, platformServer, organizationID,
		mintorganizationtoken.MintOrganizationTokenBody{Name: "not-yours", Scopes: nil, TTL: ""})

	siblingTokenID, _, err := createPlatformToken("sibling-"+uuid.NewString(), scope.AllScopes())
	require.NoError(t, err)
	siblingServer := tests.NewTestServer(testDb, tests.TestServerOptions{
		PlatformCredential: true,
		PlatformTokenID:    siblingTokenID,
	})

	require.Equal(t, http.StatusNotFound,
		revokeAsPlatform(t, siblingServer, organizationID, minted.Slug))

	var revokedDate *time.Time
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT revoked_date FROM token WHERE id = $1`, minted.ID).Scan(&revokedDate))
	require.Nil(t, revokedDate, "a sibling platform credential revoked another's issue")
}

// --- helpers ------------------------------------------------------------------

func mintAsPlatform(
	t *testing.T,
	server *tests.TestServer,
	organizationID uuid.UUID,
	body mintorganizationtoken.MintOrganizationTokenBody,
) schema.PlainToken {
	t.Helper()

	request := commonfixture.NewJSONRequest(t, http.MethodPost,
		"/api/platform/organizations/"+organizationID.String()+"/tokens", body)
	response, err := server.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	return commonfixture.AssertJSONResponse[schema.PlainToken](t, response, http.StatusCreated)
}

func mintExpectingError(
	t *testing.T,
	server *tests.TestServer,
	organizationID uuid.UUID,
	body mintorganizationtoken.MintOrganizationTokenBody,
	expectedStatus int,
) map[string]any {
	t.Helper()

	request := commonfixture.NewJSONRequest(t, http.MethodPost,
		"/api/platform/organizations/"+organizationID.String()+"/tokens", body)
	response, err := server.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	return commonfixture.AssertJSONResponse[map[string]any](t, response, expectedStatus)
}

func revokeAsPlatform(t *testing.T, server *tests.TestServer, organizationID uuid.UUID, slug string) int {
	t.Helper()

	request := commonfixture.NewJSONRequest(t, http.MethodDelete,
		"/api/platform/organizations/"+organizationID.String()+"/tokens/"+slug, nil)
	response, err := server.PlatformApp.Test(request, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, response.Body)

	return response.StatusCode
}

func organizationExternalID(t *testing.T, organizationID uuid.UUID) string {
	t.Helper()

	var externalID string
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT external_id FROM organization WHERE id = $1`, organizationID).Scan(&externalID))

	return externalID
}

// softDeleteSystemMembership reaches a state the API deliberately cannot: the
// protect trigger exists precisely to forbid this. Disabled for one statement and
// restored immediately, so no other test observes a database without the
// invariant.
func softDeleteSystemMembership(t *testing.T, organizationID uuid.UUID) {
	t.Helper()

	_, err := testDb.DbPool.Exec(t.Context(),
		`ALTER TABLE "user_on_organization" DISABLE TRIGGER "trg_protect_kaiten_system_membership"`)
	require.NoError(t, err)

	_, err = testDb.DbPool.Exec(t.Context(),
		`UPDATE "user_on_organization" SET "deleted_at" = now()
		 WHERE "organization_id" = $1 AND "user_id" = $2`,
		organizationID, platformidentity.ID)
	require.NoError(t, err)

	_, err = testDb.DbPool.Exec(t.Context(),
		`ALTER TABLE "user_on_organization" ENABLE TRIGGER "trg_protect_kaiten_system_membership"`)
	require.NoError(t, err)
}

func parseUnverifiedClaims(t *testing.T, authorizationHeader string) jwt.MapClaims {
	t.Helper()

	require.True(t, strings.HasPrefix(authorizationHeader, "Bearer "),
		"the validation response carried no bearer token")

	parsed, _, err := jwt.NewParser().ParseUnverified(authorizationHeader[len("Bearer "):], jwt.MapClaims{})
	require.NoError(t, err)

	claims, ok := parsed.Claims.(jwt.MapClaims)
	require.True(t, ok)

	return claims
}
