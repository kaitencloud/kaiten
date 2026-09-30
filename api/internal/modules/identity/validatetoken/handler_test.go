package validatetoken

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokencache"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

type stubRepository struct {
	tokenData *TokenData
	err       error
	calls     int
}

func (s *stubRepository) ValidateToken(_ context.Context, _ string) (*TokenData, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	return s.tokenData, nil
}

func TestHandler_ValidateToken(t *testing.T) {
	t.Run("WhenPlainPAT_ReturnUnsignedJWT", func(t *testing.T) {
		repo := &stubRepository{
			tokenData: &TokenData{
				SubjectID:              uuid.New(),
				OrganizationID:         uuid.New(),
				Scopes:                 []string{"write:entitlements"},
				SubjectExternalID:      "user_splinter",
				OrganizationExternalID: "org_tmnt_hq",
			},
		}

		handler := NewHandler(repo, tokencache.New())

		resp, err := handler.ValidateToken(context.Background(), "ksh_test-token")
		require.NoError(t, err)
		require.True(t, resp.Valid)
		require.NotEmpty(t, resp.JWTToken)

		claims := jwt.MapClaims{}
		_, _, err = jwt.NewParser().ParseUnverified(resp.JWTToken, claims)
		require.NoError(t, err)
		require.Equal(t, "user_splinter", claims["sub"])
		require.Equal(t, "org_tmnt_hq", claims["kaiten_external_org_id"])
		require.Nil(t, claims["kaiten_user_id"])
		require.Nil(t, claims["kaiten_org_id"])
		require.Nil(t, claims["org_id"])
	})

	t.Run("WhenNonPATToken_ReturnUnauthorized", func(t *testing.T) {
		handler := NewHandler(&stubRepository{}, tokencache.New())

		resp, err := handler.ValidateToken(context.Background(), "provider-session-token")
		require.NoError(t, err)
		require.False(t, resp.Valid)
		require.Equal(t, "invalid token", resp.Error)
	})
}

// TestHandler_JWTExpiryIsClampedToTheCredential covers the half of the TTL fix
// that lives in generateJWT: the minted JWT may never outlive the credential it
// was derived from. Before the clamp a 2-minute PAT produced an hour-valid JWT,
// and nothing downstream re-checks the credential, so the TTL bounded nothing.
func TestHandler_JWTExpiryIsClampedToTheCredential(t *testing.T) {
	testCases := []struct {
		name       string
		expiresIn  *time.Duration // nil means the credential never expires
		wantExpiry func(now time.Time) time.Time
	}{
		{
			name:       "WhenCredentialNeverExpires_UseTheJWTLifetime",
			expiresIn:  nil,
			wantExpiry: func(now time.Time) time.Time { return now.Add(jwtLifetime) },
		},
		{
			name:       "WhenCredentialOutlivesTheJWT_UseTheJWTLifetime",
			expiresIn:  durationPtr(24 * time.Hour),
			wantExpiry: func(now time.Time) time.Time { return now.Add(jwtLifetime) },
		},
		{
			name:       "WhenCredentialExpiresSooner_ClampToTheCredential",
			expiresIn:  durationPtr(2 * time.Minute),
			wantExpiry: func(now time.Time) time.Time { return now.Add(2 * time.Minute) },
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			now := time.Now()

			data := &TokenData{
				SubjectID:              uuid.New(),
				OrganizationID:         uuid.New(),
				Scopes:                 []string{"read:customers"},
				SubjectExternalID:      "system:kaiten",
				OrganizationExternalID: "org_tmnt_hq",
			}
			if testCase.expiresIn != nil {
				expiresAt := now.Add(*testCase.expiresIn)
				data.ExpiresAt = &expiresAt
			}

			handler := NewHandler(&stubRepository{tokenData: data}, tokencache.New())

			resp, err := handler.ValidateToken(context.Background(), "ksh_test-token")
			require.NoError(t, err)
			require.True(t, resp.Valid)

			// Second-granularity claim, so a second of slack either way.
			require.WithinDuration(t, testCase.wantExpiry(now), jwtExpiry(t, resp.JWTToken), 2*time.Second)
		})
	}
}

// TestHandler_CacheRespectsCredentialExpiry covers the other half: ttlcache has
// one fixed TTL per instance, so a hit says only "cached recently", never "still
// valid". The SQL lookup a hit skips is the one carrying the expiry predicate,
// which is why the entry has to be re-checked here.
func TestHandler_CacheRespectsCredentialExpiry(t *testing.T) {
	const plainToken = "ksh_test-token"
	const cachedJWT = "cached.jwt.value"

	t.Run("WhenEntryIsLive_ServeItWithoutTouchingTheRepository", func(t *testing.T) {
		cache := tokencache.New()
		expiresAt := time.Now().Add(time.Hour)
		cache.Set(token.LookupHash(plainToken), tokencache.Entry{JWT: cachedJWT, ExpiresAt: &expiresAt})

		// A repository that fails if consulted: the assertion is that it is not.
		repo := &stubRepository{err: errors.New("repository must not be consulted on a live cache hit")}
		handler := NewHandler(repo, cache)

		resp, err := handler.ValidateToken(context.Background(), plainToken)
		require.NoError(t, err)
		require.True(t, resp.Valid)
		require.Equal(t, cachedJWT, resp.JWTToken)
		require.Zero(t, repo.calls)
	})

	t.Run("WhenEntryOutlivedItsCredential_DoNotServeIt", func(t *testing.T) {
		cache := tokencache.New()
		expiredAt := time.Now().Add(-time.Minute)
		cache.Set(token.LookupHash(plainToken), tokencache.Entry{JWT: cachedJWT, ExpiresAt: &expiredAt})

		repo := &stubRepository{err: errors.New("token not found or invalid")}
		handler := NewHandler(repo, cache)

		resp, err := handler.ValidateToken(context.Background(), plainToken)
		require.NoError(t, err)
		require.False(t, resp.Valid, "an expired credential's cached JWT must not authenticate")
		require.Empty(t, resp.JWTToken)
		require.Equal(t, 1, repo.calls, "the dead entry must fall through to the expiry-checking lookup")

		_, stillCached := cache.Get(token.LookupHash(plainToken))
		require.False(t, stillCached, "the dead entry must be evicted, not left to be re-checked forever")
	})
}

// TestHandler_OrganizationCredentialStaysUnsigned pins the organization JWT's
// one distinguishing property. It is unsigned because the gateway is that path's
// trust boundary, and signing it here would be a separate change.
func TestHandler_OrganizationCredentialStaysUnsigned(t *testing.T) {
	data := &TokenData{
		SubjectID:              uuid.New(),
		OrganizationID:         uuid.New(),
		Scopes:                 []string{"read:customers"},
		SubjectExternalID:      "svc_dogfooding",
		OrganizationExternalID: "org_tmnt_hq",
	}
	handler := NewHandler(&stubRepository{tokenData: data}, tokencache.New())

	resp, err := handler.ValidateToken(context.Background(), token.PrefixOrganization+"test-token")
	require.NoError(t, err)
	require.True(t, resp.Valid)
	require.Equal(t, "none", jwtAlgorithm(t, resp.JWTToken),
		"the organization path's trust boundary is the gateway, and signing it here is a separate change")
}

// TestHandler_RefusesEveryPrefixButKsh is the credential-family guard, and the
// `ksm_` case is the one that matters.
//
// This endpoint is the Core API's ext_authz hook and exchanges organization
// credentials only. A platform credential is authenticated by the listener that
// serves the Platform API, straight from the raw `ksm_`, so there is no lookup
// here that could resolve one and no branch that could route to it. The gateway
// does not forward `ksm_` here either -- this is the floor under that, for a
// caller that reaches the API by some other route.
//
// Every case gets the same answer, including the platform one: a caller is never
// told it presented the wrong family to the right service.
func TestHandler_RefusesEveryPrefixButKsh(t *testing.T) {
	for name, credential := range map[string]string{
		"a platform credential": token.PrefixPlatform + "test-token",
		"no prefix at all":      "test-token",
		"a near-miss prefix":    "ksh-test-token",
		"the empty string":      "",
	} {
		t.Run(name, func(t *testing.T) {
			repo := &stubRepository{
				tokenData: &TokenData{SubjectExternalID: "svc_x", OrganizationExternalID: "org_x"},
			}
			handler := NewHandler(repo, tokencache.New())

			resp, err := handler.ValidateToken(context.Background(), credential)
			require.NoError(t, err)
			require.False(t, resp.Valid)
			require.Equal(t, invalidTokenMessage, resp.Error)
			require.Zero(t, repo.calls,
				"%s must be refused by shape, without a lookup", name)
		})
	}
}

// TestHandler_OrganizationMintRequiresAnOrganization is the mirror assertion: the
// organization claim is what auth requires and JIT resolves, so an empty one
// would authenticate a request into no tenant at all.
func TestHandler_OrganizationMintRequiresAnOrganization(t *testing.T) {
	data := &TokenData{SubjectExternalID: "svc_x", OrganizationExternalID: ""}
	handler := NewHandler(&stubRepository{tokenData: data}, tokencache.New())

	resp, err := handler.ValidateToken(context.Background(), token.PrefixOrganization+"test-token")
	require.NoError(t, err)
	require.False(t, resp.Valid)
	require.Equal(t, invalidTokenMessage, resp.Error)
}

func durationPtr(d time.Duration) *time.Duration { return &d }

func jwtAlgorithm(t *testing.T, tokenString string) string {
	t.Helper()

	parsed, _, err := jwt.NewParser().ParseUnverified(tokenString, jwt.MapClaims{})
	require.NoError(t, err)

	return parsed.Method.Alg()
}

func jwtExpiry(t *testing.T, tokenString string) time.Time {
	t.Helper()

	claims := jwt.MapClaims{}
	_, _, err := jwt.NewParser().ParseUnverified(tokenString, claims)
	require.NoError(t, err)

	expiry, err := claims.GetExpirationTime()
	require.NoError(t, err)
	require.NotNil(t, expiry, "the minted JWT must carry an exp claim")

	return expiry.Time
}
