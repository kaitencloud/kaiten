package deletetokenonserviceaccount

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokencache"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// TokenCacheInvalidationChannel is the Postgres NOTIFY channel this handler
// publishes to after revoking a token, and that the identity module's
// credential cache listens on (registered in identity_module.go) to evict the
// same key on every other replica. See internal/infrastructure/pgnotify for the
// mechanism.
const TokenCacheInvalidationChannel = "identity_token_cache_invalidate"

// Deps lists exactly what this handler needs, instead of the full
// services.Container. Pool is used only for the post-commit NOTIFY below,
// which is intentionally pool-backed rather than transaction-scoped (it
// runs after RevokeToken's own write already committed).
type Deps struct {
	UserProvider  currentuser.Provider
	Queries       *db.Queries
	Pool          *pgxpool.Pool
	UsageReporter services.UsageReporter
}

type UseCase struct {
	deps       Deps
	repository *CommandRepository
	tokenCache *tokencache.Cache
}

func NewUseCase(deps Deps, tokenCache *tokencache.Cache) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewCommandRepository(deps.Queries),
		tokenCache: tokenCache,
	}
}

func (h *UseCase) Execute(ctx context.Context, serviceAccountSlug, tokenSlug string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return fmt.Errorf("get user: %w", err)
	}

	lookupHash, err := h.repository.RevokeToken(ctx, serviceAccountSlug, tokenSlug, user.ID, user.OrganizationID)
	if err != nil {
		return fmt.Errorf("revoke token: %w", err)
	}

	h.tokenCache.Delete(lookupHash)

	// Best-effort: propagate the eviction to every other replica's cache via
	// Postgres NOTIFY. A failure here doesn't fail the request -- the token
	// is already revoked in the DB and evicted from this process's own
	// cache, so the only exposure is other replicas serving a cached JWT
	// for a revoked token until its 5-minute TTL expires, same as before
	// this NOTIFY existed at all.
	if err := pgnotify.Publish(ctx, h.deps.Pool, TokenCacheInvalidationChannel, lookupHash); err != nil {
		slog.WarnContext(ctx, "failed to publish token cache invalidation", "error", err)
	}

	h.deps.UsageReporter.DecrementAsync(user.OrganizationID, dogfooding.ServiceAccountTokenEntitlementSlug)

	return nil
}
