package auth

import (
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// stubValidator stands in for identity/validateplatformtoken. It records what it
// was asked, which is how the tests below assert the thing that matters most
// about this middleware's ORDER: an organization credential must be refused
// without a lookup ever happening.
type stubValidator struct {
	tokenID uuid.UUID
	scopes  []string
	ok      bool

	calls []string
}

func (s *stubValidator) ValidatePlatformToken(
	_ context.Context, plainToken string,
) (uuid.UUID, []string, bool) {
	s.calls = append(s.calls, plainToken)
	if !s.ok {
		return uuid.Nil, nil, false
	}
	return s.tokenID, s.scopes, true
}

func liveValidator(tokenID uuid.UUID, scopes ...string) *stubValidator {
	return &stubValidator{tokenID: tokenID, scopes: scopes, ok: true}
}

// A credential of the right SHAPE that the database does not accept: unknown,
// expired or revoked. The middleware cannot tell those apart and must not.
func deadValidator() *stubValidator { return &stubValidator{ok: false} }

// platformCredential is a syntactically valid ksm_ token. It never has to be a
// real one here -- the stub decides -- but it must carry the prefix, because the
// prefix is what this middleware itself reads.
const platformCredential = "ksm_" + "0123456789abcdef0123456789abcdef"

// organizationCredential is the other family, which this listener must refuse.
const organizationCredential = "ksh_" + "0123456789abcdef0123456789abcdef"

// runMiddleware drives a middleware over one request and reports the status plus
// the principal the next handler saw. Going through the real Fiber chain rather
// than calling the readers directly is deliberate: the header extraction and the
// order of the checks are part of what is under test.
func runMiddleware(t *testing.T, middleware Middleware, tokenString string) (int, *principal.Principal) {
	t.Helper()

	app := createTestApp()

	var captured *principal.Principal
	app.Use(middleware.Authorization())
	app.Get("/test", func(c fiber.Ctx) error {
		captured, _ = principal.FromContext(c.Context())
		return c.SendStatus(fiber.StatusOK)
	})

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)

	resp, err := app.Test(req)
	require.NoError(t, err)

	return resp.StatusCode, captured
}

func signUnsigned(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()

	signed, err := jwt.NewWithClaims(jwt.SigningMethodNone, claims).
		SignedString(jwt.UnsafeAllowNoneSignatureType)
	require.NoError(t, err)

	return signed
}

// responseBody drives one request and returns the decoded problem body, for the
// assertions that are about the CODE rather than the status.
func responseBody(t *testing.T, middleware Middleware, tokenString string) (int, map[string]any) {
	t.Helper()

	app := createTestApp()
	app.Use(middleware.Authorization())
	app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)

	resp, err := app.Test(req)
	require.NoError(t, err)
	defer func() { require.NoError(t, resp.Body.Close()) }()

	raw, err := io.ReadAll(resp.Body)
	require.NoError(t, err)

	var body map[string]any
	require.NoError(t, json.Unmarshal(raw, &body))

	return resp.StatusCode, body
}

// TestPlatformMiddleware_PlatformPrincipal is the happy path, and every assertion
// in it is a rule from the design: the identity is system:kaiten's own row, the
// organization is nil because a platform credential has no execution context, the
// token id and scopes came from the database rather than from anything the caller
// wrote, and Provisioning is empty because JIT never runs on this listener and has
// nothing to resolve.
func TestPlatformMiddleware_PlatformPrincipal(t *testing.T) {
	tokenID := uuid.New()
	validator := liveValidator(tokenID, "read:tokens", "write:tokens")

	status, captured := runMiddleware(t, NewPlatform(validator), platformCredential)

	require.Equal(t, fiber.StatusOK, status)
	require.NotNil(t, captured)
	assert.Equal(t, principal.KindPlatform, captured.Kind)
	assert.True(t, captured.IsPlatform())
	assert.Equal(t, platformidentity.ID, captured.UserID)
	assert.Equal(t, uuid.Nil, captured.OrganizationID,
		"a platform credential has no organization, by construction")
	assert.Equal(t, tokenID, captured.PlatformTokenID)
	assert.Equal(t, []string{"read:tokens", "write:tokens"}, captured.Scopes)
	assert.Equal(t, principal.Provisioning{}, captured.Provisioning,
		"there is nothing to provision: the identity exists and has no organization")

	assert.Equal(t, []string{platformCredential}, validator.calls,
		"the credential must reach the validator exactly as presented")
}

// TestPlatformMiddleware_RefusesAnOrganizationCredentialWithoutLookingItUp is the
// credential-class refusal, and it asserts the ORDER as much as the answer.
//
// A `ksh_` here is a well-formed credential presented to the wrong surface. It
// gets 403 with the shared wrong-class code -- the same one caller.Organization
// gives in the other direction on the Core API -- and it gets it from the prefix
// alone. That the validator is never called is the security property: this
// listener never touches the tenant credential table, so it cannot be turned into
// an oracle for which organization tokens exist, and a caller cannot spend its
// bcrypt by sending `ksh_` at it.
func TestPlatformMiddleware_RefusesAnOrganizationCredentialWithoutLookingItUp(t *testing.T) {
	validator := liveValidator(uuid.New(), "read:tokens")

	status, body := responseBody(t, NewPlatform(validator), organizationCredential)

	require.Equal(t, fiber.StatusForbidden, status)
	assert.Equal(t, principal.ErrCodeWrongCredentialKind, body["error"],
		"the wrong credential class must answer with the shared code, not a platform-specific one")
	assert.Empty(t, validator.calls,
		"an organization credential must be refused by shape, before any database lookup")
}

// TestPlatformMiddleware_RefusesEveryCredentialThatIsNotAKsm covers the shapes
// that are neither family. All of them are the wrong CLASS rather than a failed
// authentication: none of them is a platform credential, and none is looked up.
func TestPlatformMiddleware_RefusesEveryCredentialThatIsNotAKsm(t *testing.T) {
	staleJWT := signUnsigned(t, jwt.MapClaims{
		"sub": platformidentity.ExternalID,
		// Written as literals, which is the point of both tests that use them: these
		// are arbitrary strings a caller controls, naming a claim nothing in the
		// process reads any more.
		"kaiten_credential_kind":   string(principal.KindPlatform),
		"kaiten_platform_token_id": uuid.New().String(),
		"scopes":                   []string{"delete:organizations"},
		"iat":                      time.Now().Unix(),
		"exp":                      time.Now().Add(time.Hour).Unix(),
	})

	cases := map[string]string{
		"an organization credential":  organizationCredential,
		"a JWT of the retired kind":   staleJWT,
		"an unprefixed random string": "0123456789abcdef0123456789abcdef",
		"a near-miss prefix":          "ksm-0123456789abcdef",
	}

	for name, credential := range cases {
		t.Run(name, func(t *testing.T) {
			validator := liveValidator(uuid.New(), "read:tokens")

			status, captured := runMiddleware(t, NewPlatform(validator), credential)

			assert.Equal(t, fiber.StatusForbidden, status)
			assert.Nil(t, captured, "no principal may come out of a credential of the wrong class")
			assert.Empty(t, validator.calls, "%s must not be looked up", name)
		})
	}
}

// TestPlatformMiddleware_ThePrefixCheckIsAClassCheck is the boundary of the test
// above. `ksm_` with nothing after it is not a usable credential, but it IS the
// platform class, so it goes to the validator to be refused there rather than
// being turned away as the wrong kind. The middleware decides class and delegates
// everything else, and a length rule creeping into the prefix check would be the
// first step away from that.
func TestPlatformMiddleware_ThePrefixCheckIsAClassCheck(t *testing.T) {
	validator := deadValidator()

	status, _ := runMiddleware(t, NewPlatform(validator), "ksm_")

	assert.Equal(t, fiber.StatusUnauthorized, status,
		"a malformed platform credential is refused as a platform credential")
	assert.Equal(t, []string{"ksm_"}, validator.calls)
}

// TestPlatformMiddleware_RefusesACredentialTheDatabaseDoesNotAccept is the other
// half: right class, and still no.
//
// Unknown, expired and revoked are one answer here on purpose. The middleware is
// handed a boolean precisely so it has nothing to distinguish them with, and a
// caller therefore cannot learn from the response whether a credential ever
// existed.
func TestPlatformMiddleware_RefusesACredentialTheDatabaseDoesNotAccept(t *testing.T) {
	validator := deadValidator()

	status, body := responseBody(t, NewPlatform(validator), platformCredential)

	require.Equal(t, fiber.StatusUnauthorized, status,
		"a credential of the right class that does not authenticate is 401, not 403")
	assert.Equal(t, "Auth.InvalidPlatformToken", body["error"])
	assert.Len(t, validator.calls, 1, "a ksm_ must be looked up before it is refused")
}

// TestPlatformMiddleware_RefusesAMissingOrMalformedHeader keeps the header
// handling shared with the Core middleware honest: neither reaches a validator
// without a bearer token to validate.
func TestPlatformMiddleware_RefusesAMissingOrMalformedHeader(t *testing.T) {
	for name, header := range map[string]string{
		"no header":      "",
		"not a bearer":   "Basic dXNlcjpwYXNz",
		"bearer, no tok": "Bearer ",
	} {
		t.Run(name, func(t *testing.T) {
			validator := liveValidator(uuid.New(), "read:tokens")

			app := createTestApp()
			app.Use(NewPlatform(validator).Authorization())
			app.Get("/test", func(c fiber.Ctx) error { return c.SendStatus(fiber.StatusOK) })

			req := httptest.NewRequest("GET", "/test", nil)
			if header != "" {
				req.Header.Set("Authorization", header)
			}

			resp, err := app.Test(req)
			require.NoError(t, err)
			defer func() { require.NoError(t, resp.Body.Close()) }()

			assert.GreaterOrEqual(t, resp.StatusCode, fiber.StatusBadRequest)
			assert.Empty(t, validator.calls)
		})
	}
}

// TestCoreMiddlewareCannotAuthenticateAPlatformCredential is the whole point of
// splitting the two middlewares, asserted on the SAME credential.
func TestCoreMiddlewareCannotAuthenticateAPlatformCredential(t *testing.T) {
	status, captured := runMiddleware(t, New(), platformCredential)

	assert.Equal(t, fiber.StatusUnauthorized, status,
		"a platform credential is not an authentication mechanism on the Core API")
	assert.Nil(t, captured, "no principal of any kind may come out of a platform credential here")

	tokenID := uuid.New()
	platformStatus, platformPrincipal := runMiddleware(t,
		NewPlatform(liveValidator(tokenID, "read:tokens")), platformCredential)
	require.Equal(t, fiber.StatusOK, platformStatus,
		"the same credential must still work on the listener that owns it")
	require.NotNil(t, platformPrincipal)
	assert.True(t, platformPrincipal.IsPlatform())
	assert.Equal(t, tokenID, platformPrincipal.PlatformTokenID)
}

// TestCoreMiddlewareIgnoresTheCredentialKindClaim pins the mechanism, not just the
// outcome: the Core path does not read the claim at all, so no value a caller
// writes into it selects a different code path there.
//
// The token below declares itself a platform credential AND carries an
// organization. It authenticates as the organization principal its own claims
// already described -- no privilege gained, because an unsigned organization JWT
// grants exactly this with or without the extra claim.
func TestCoreMiddlewareIgnoresTheCredentialKindClaim(t *testing.T) {
	tokenString := signUnsigned(t, jwt.MapClaims{
		"sub": "user_splinter",
		// Written as literals, which is the point of both tests that use them: these
		// are arbitrary strings a caller controls, naming a claim nothing in the
		// process reads any more.
		"kaiten_credential_kind":   string(principal.KindPlatform),
		"kaiten_platform_token_id": uuid.New().String(),
		"kaiten_external_org_id":   "org_tmnt_hq",
		"scopes":                   []string{"delete:organizations"},
		"iat":                      time.Now().Unix(),
		"exp":                      time.Now().Add(time.Hour).Unix(),
	})

	status, captured := runMiddleware(t, New(), tokenString)

	require.Equal(t, fiber.StatusOK, status)
	require.NotNil(t, captured)
	assert.Equal(t, principal.KindOrganization, captured.Kind,
		"a claim the caller controls must not upgrade a credential's class")
	assert.False(t, captured.IsPlatform())
	assert.Equal(t, uuid.Nil, captured.PlatformTokenID)
	assert.Equal(t, "org_tmnt_hq", captured.Provisioning.ExternalOrganizationID)

	// And the same token gets nowhere on the listener that would care, because it
	// is not a platform credential -- it is a JWT, and this listener stopped
	// speaking JWTs.
	validator := liveValidator(uuid.New(), "delete:organizations")
	platformStatus, platformPrincipal := runMiddleware(t, NewPlatform(validator), tokenString)
	assert.Equal(t, fiber.StatusForbidden, platformStatus)
	assert.Nil(t, platformPrincipal)
	assert.Empty(t, validator.calls)
}
