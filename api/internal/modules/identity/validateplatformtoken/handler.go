// Package validateplatformtoken authenticates a raw `ksm_` platform credential.
package validateplatformtoken

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokencache"
	"github.com/kaitencloud/kaiten/api/internal/shared/token"
)

// UseCase resolves a raw platform credential to the facts a principal needs.
type UseCase interface {
	// ValidatePlatformToken returns the credential's own row id and the scopes it
	// carries, or ok=false if it is not a live platform credential.
	//
	// It reports a boolean rather than an error, and the distinction is the point:
	// "this credential does not authenticate" is an ordinary answer here, not a
	// failure of this call. Every reason for it -- an unknown prefix, no row, a
	// hash mismatch, an expired credential -- produces the same false, so the
	// caller cannot turn this into an oracle for which platform tokens exist.
	ValidatePlatformToken(ctx context.Context, plainToken string) (tokenID uuid.UUID, scopes []string, ok bool)
}

type useCase struct {
	repo  Repository
	cache *tokencache.Cache
}

// NewHandler creates the use case from its two collaborators.
func NewHandler(repo Repository, cache *tokencache.Cache) UseCase {
	return &useCase{repo: repo, cache: cache}
}

// NewUseCase wires the use case from the identity module's queries and its shared
// credential cache. The cache must be that shared instance -- see the package doc.
func NewUseCase(queries *db.Queries, cache *tokencache.Cache) UseCase {
	return NewHandler(NewRepository(queries), cache)
}

func (h *useCase) ValidatePlatformToken(
	ctx context.Context, plainToken string,
) (uuid.UUID, []string, bool) {
	// The prefix check is first and is not an optimisation. This use case must
	// never present an organization credential to the platform query: the query
	// would not match it, but a `ksh_` reaching a bcrypt compare here would still
	// cost the compare, and refusing by shape keeps "the Platform listener
	// understands one credential family" a property of this function rather than
	// of the SQL it happens to call.
	if !strings.HasPrefix(plainToken, token.PrefixPlatform) {
		return uuid.Nil, nil, false
	}

	key := token.LookupHash(plainToken)

	// A hit is re-checked against the credential's own expiry, not just the
	// cache's TTL: the two answer different questions, and only the SQL lookup
	// this hit skipped carries the expiry predicate.
	if cached, ok := h.cache.Get(key); ok {
		if cached.Platform != nil && cached.Live(time.Now()) {
			return cached.Platform.TokenID, cached.Platform.Scopes, true
		}
		h.cache.Delete(key)
	}

	credential, err := h.repo.ValidatePlatformToken(ctx, plainToken)
	if err != nil {
		return uuid.Nil, nil, false
	}

	h.cache.Set(key, tokencache.Entry{
		Platform:  &tokencache.PlatformEntry{TokenID: credential.TokenID, Scopes: credential.Scopes},
		ExpiresAt: credential.ExpiresAt,
	})

	return credential.TokenID, credential.Scopes, true
}
