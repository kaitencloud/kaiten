package validatetoken

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokencache"
	"github.com/kaitencloud/kaiten/api/internal/shared/jwtutil"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

// jwtLifetime is the longest an internal JWT is valid for. A credential that
// expires sooner than this gets a correspondingly shorter JWT -- see
// clampedExpiry.
const jwtLifetime = time.Hour

// One message for every failure, whatever caused it: an unknown prefix, a
// missing row, a hash mismatch, an expired credential. A caller learns that the
// credential did not work and nothing about why -- including, for a `ksm_`, that
// it presented a family this endpoint no longer serves.
const invalidTokenMessage = "invalid token"

// UseCase handles token validation logic.
type UseCase interface {
	ValidateToken(ctx context.Context, plainToken string) (*ValidationResponse, error)
}

// ValidationResponse represents the validation result.
type ValidationResponse struct {
	Valid    bool   `json:"valid"`
	JWTToken string `json:"jwt_token,omitempty"`
	Error    string `json:"error,omitempty"`
}

type useCase struct {
	repo  Repository
	cache *tokencache.Cache
}

// NewHandler creates a new validation handler.
func NewHandler(repo Repository, cache *tokencache.Cache) UseCase {
	return &useCase{repo: repo, cache: cache}
}

// ValidateToken validates an ORGANIZATION credential and returns the internal JWT
// the gateway forwards in its place. Externally issued provider JWTs never reach
// here -- the proxy's own jwt_authn filter verifies those (see
// docker/envoy/kaiten.yaml.tmpl). Results are cached in memory to avoid a
// SQL+bcrypt round-trip on every Envoy ext_authz call.
//
// `ksh_` and nothing else. This endpoint is the Core API's ext_authz hook, and it
// is reachable without a credential by definition -- it is the thing that turns
// one into a credential -- so it sits on the public listener, in front of the
// gateway. A platform credential is authenticated by the listener that serves the
// Platform API, from the raw `ksm_`, with no exchange and no JWT: see
// identity/validateplatformtoken and auth.PlatformMiddleware. The gateway no
// longer forwards `ksm_` here either, so the two credential families now meet at
// no shared point at all.
//
// A `ksm_` arriving anyway is reported invalid, which is the same answer any
// unrecognised prefix gets. It is not told that it presented the wrong family to
// the right service.
func (h *useCase) ValidateToken(ctx context.Context, plainToken string) (*ValidationResponse, error) {
	if !strings.HasPrefix(plainToken, token.PrefixOrganization) {
		return &ValidationResponse{Valid: false, Error: invalidTokenMessage}, nil
	}

	return h.validate(ctx, plainToken, h.repo.ValidateToken, generateOrganizationJWT), nil
}

// validate is the flow: one cache probe, one lookup, one mint, one cache write.
//
// It keeps the lookup and mint as parameters even though one credential family is
// left, because they are what pins this function to the organization path -- the
// mint asserts an organization is present, so a future second caller cannot reuse
// this with a lookup that has none.
//
// The cache instance is shared with identity/validateplatformtoken and cannot
// confuse the two: the key is a hash of the whole plaintext, prefix included, so
// an entry is only ever reached by the exact credential that produced it. Sharing
// it is what makes one revocation evict one key everywhere.
//
// Results are cached to avoid a SQL+bcrypt round-trip on every ext_authz call.
func (h *useCase) validate(
	ctx context.Context,
	plainToken string,
	lookup func(context.Context, string) (*TokenData, error),
	mint func(*TokenData) (string, error),
) *ValidationResponse {
	key := token.LookupHash(plainToken)

	// A hit is re-checked against the credential's own expiry, not just the
	// cache's TTL: the two answer different questions, and only the SQL lookup
	// this hit skipped carries the expiry predicate.
	if cached, ok := h.cache.Get(key); ok {
		// The JWT check is belt to the key's braces. A platform entry cannot be
		// reached by this key, but an entry with no JWT must never be served as one
		// either way -- handing back an empty Authorization header would let the
		// gateway forward an unauthenticated request.
		if cached.JWT != "" && cached.Live(time.Now()) {
			return &ValidationResponse{Valid: true, JWTToken: cached.JWT}
		}
		h.cache.Delete(key)
	}

	tokenData, err := lookup(ctx, plainToken)
	if err != nil {
		return &ValidationResponse{Valid: false, Error: invalidTokenMessage}
	}

	jwtToken, err := mint(tokenData)
	if err != nil {
		// A credential that verified but cannot mint a JWT is a server-side
		// problem -- an unconfigured signing key, or data that broke an invariant
		// the mint asserts -- and it is invisible from the response, which says
		// only what every other failure says. Log it; the error never carries
		// token material.
		slog.ErrorContext(ctx, "identity: a valid credential could not mint an internal JWT", "error", err)
		return &ValidationResponse{Valid: false, Error: invalidTokenMessage}
	}

	h.cache.Set(key, tokencache.Entry{JWT: jwtToken, ExpiresAt: tokenData.ExpiresAt})

	return &ValidationResponse{Valid: true, JWTToken: jwtToken}
}

// clampedExpiry bounds an internal JWT by the credential it was derived from.
// Without the clamp a token expiring in fifteen minutes still minted an
// hour-valid JWT, so any TTL shorter than an hour was decorative: the JWT
// outlived the credential, and nothing downstream rechecks it.
func clampedExpiry(now time.Time, credentialExpiry *time.Time) time.Time {
	expiresAt := now.Add(jwtLifetime)
	if credentialExpiry != nil && credentialExpiry.Before(expiresAt) {
		expiresAt = *credentialExpiry
	}
	return expiresAt
}

// generateOrganizationJWT creates the internal identity JWT for an organization
// credential. It is unsigned because the trusted proxy has already validated the
// credential and replaces the original Authorization header before forwarding
// the request.
func generateOrganizationJWT(data *TokenData) (string, error) {
	// The organization claim is what the whole downstream identity model reads
	// (auth requires it, JIT resolves it). An empty one would authenticate a
	// request into no tenant at all, so refuse rather than emit it.
	if data.OrganizationExternalID == "" {
		return "", fmt.Errorf("validatetoken: organization credential has no organization")
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"sub":                    data.SubjectExternalID,
		"kaiten_external_org_id": data.OrganizationExternalID,
		"scopes":                 data.Scopes,
		"iat":                    now.Unix(),
		"exp":                    clampedExpiry(now, data.ExpiresAt).Unix(),
	}
	return jwtutil.SignUnsigned(claims)
}

// NewUseCase creates a new ValidateToken handler with all dependencies wired.
func NewUseCase(queries *db.Queries, cache *tokencache.Cache) UseCase {
	return NewHandler(NewRepository(queries), cache)
}
