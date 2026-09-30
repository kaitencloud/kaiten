package validateplatformtoken

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokencache"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

type stubRepository struct {
	credential *Credential
	err        error
	calls      int
}

func (s *stubRepository) ValidatePlatformToken(_ context.Context, _ string) (*Credential, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	return s.credential, nil
}

const credential = token.PrefixPlatform + "0123456789abcdef"

func liveCredential() *Credential {
	return &Credential{TokenID: uuid.New(), Scopes: []string{"read:tokens", "write:tokens"}}
}

func TestValidatePlatformToken(t *testing.T) {
	t.Run("WhenLive_ReturnsTheRowsIdAndScopes", func(t *testing.T) {
		want := liveCredential()
		uc := NewHandler(&stubRepository{credential: want}, tokencache.New())

		tokenID, scopes, ok := uc.ValidatePlatformToken(context.Background(), credential)

		require.True(t, ok)
		require.Equal(t, want.TokenID, tokenID)
		require.Equal(t, want.Scopes, scopes)
	})

	t.Run("WhenTheLookupFails_NotOk", func(t *testing.T) {
		uc := NewHandler(&stubRepository{err: errors.New("platform token not found or invalid")}, tokencache.New())

		tokenID, scopes, ok := uc.ValidatePlatformToken(context.Background(), credential)

		require.False(t, ok)
		require.Equal(t, uuid.Nil, tokenID)
		require.Nil(t, scopes)
	})
}

// TestValidatePlatformToken_RefusesAnyPrefixButKsmWithoutALookup is the half of
// this use case that protects the OTHER credential family.
//
// A `ksh_` reaching the platform query would not match it -- the query filters on
// kind -- but it would still cost the bcrypt compare behind it. Refusing by shape
// means the Platform listener never spends work on a tenant credential and never
// touches the row it belongs to.
func TestValidatePlatformToken_RefusesAnyPrefixButKsmWithoutALookup(t *testing.T) {
	for name, plainToken := range map[string]string{
		"an organization credential": token.PrefixOrganization + "0123456789abcdef",
		"no prefix":                  "0123456789abcdef",
		"a near-miss prefix":         "ksm-0123456789abcdef",
		"the empty string":           "",
	} {
		t.Run(name, func(t *testing.T) {
			repo := &stubRepository{credential: liveCredential()}
			uc := NewHandler(repo, tokencache.New())

			_, _, ok := uc.ValidatePlatformToken(context.Background(), plainToken)

			require.False(t, ok)
			require.Zero(t, repo.calls, "%s must not reach the database", name)
		})
	}
}

// TestValidatePlatformToken_CachesTheLookup is why this use case holds a cache at
// all: without it every Platform API request pays a bcrypt compare.
func TestValidatePlatformToken_CachesTheLookup(t *testing.T) {
	repo := &stubRepository{credential: liveCredential()}
	uc := NewHandler(repo, tokencache.New())

	first, _, ok := uc.ValidatePlatformToken(context.Background(), credential)
	require.True(t, ok)
	second, _, ok := uc.ValidatePlatformToken(context.Background(), credential)
	require.True(t, ok)

	require.Equal(t, first, second)
	require.Equal(t, 1, repo.calls, "the second call must be served from cache")
}

// TestValidatePlatformToken_RevocationEvictsThisCache is the property that decides
// where this use case is WIRED, not just what it does.
//
// revokeplatformtoken deletes by lookup hash from the identity module's shared
// cache, and the pgnotify listener deletes the same key on every other replica. A
// second cache instance behind this use case would be invisible to both, and a
// revoked platform credential would keep authenticating the Platform API until its
// entry aged out. The eviction below is exactly what those two do.
func TestValidatePlatformToken_RevocationEvictsThisCache(t *testing.T) {
	repo := &stubRepository{credential: liveCredential()}
	cache := tokencache.New()
	uc := NewHandler(repo, cache)

	_, _, ok := uc.ValidatePlatformToken(context.Background(), credential)
	require.True(t, ok)
	require.Equal(t, 1, repo.calls)

	cache.Delete(token.LookupHash(credential))

	repo.err = errors.New("platform token not found or invalid")
	_, _, ok = uc.ValidatePlatformToken(context.Background(), credential)

	require.False(t, ok, "a revoked credential must stop authenticating once its entry is evicted")
	require.Equal(t, 2, repo.calls, "the evicted key must go back to the database")
}

// TestValidatePlatformToken_ExpiryIsRecheckedOnACacheHit covers what the cache TTL
// alone cannot. The two answer different questions: the TTL bounds how stale a
// REVOCATION may be, and only the credential's own expiry says when it died. An
// entry cached from a credential expiring in ten seconds must not keep
// authenticating for the rest of the TTL.
func TestValidatePlatformToken_ExpiryIsRecheckedOnACacheHit(t *testing.T) {
	expired := time.Now().Add(-time.Minute)
	repo := &stubRepository{credential: &Credential{
		TokenID:   uuid.New(),
		Scopes:    []string{"read:tokens"},
		ExpiresAt: &expired,
	}}
	uc := NewHandler(repo, tokencache.New())

	_, _, ok := uc.ValidatePlatformToken(context.Background(), credential)
	require.True(t, ok, "the lookup itself decides liveness; this call populates the cache")

	repo.err = errors.New("platform token not found or invalid")
	_, _, ok = uc.ValidatePlatformToken(context.Background(), credential)

	require.False(t, ok)
	require.Equal(t, 2, repo.calls,
		"an entry past its credential's expiry must be dropped rather than served")
}
