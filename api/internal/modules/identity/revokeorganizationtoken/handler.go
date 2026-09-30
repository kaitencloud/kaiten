// Package revokeorganizationtoken retires a credential the calling platform
// credential minted, before its parent is retired.
//
// It is the early-exit counterpart to the cascade: revoking a platform credential
// revokes everything it issued, and this revokes one of them on its own. Scoped
// to the target organization *and* to tokens this platform credential issued, so
// one platform credential can never retire another's.
package revokeorganizationtoken

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/deletetokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokencache"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/platform/targetorg"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. Pool is used only for the post-commit NOTIFY, exactly as in
// deletetokenonserviceaccount.
//
// No UserProvider: currentuser.GetUser fails closed for a platform principal, and
// the revoker is recorded in SQL as the platform identity itself. No
// UsageReporter: minting did not increment the tenant's token quota, so revoking
// must not decrement it -- a platform-issued credential was never one of the
// tenant's.
type Deps struct {
	Queries *db.Queries
	Pool    *pgxpool.Pool
}

type UseCase struct {
	deps       Deps
	tokenCache *tokencache.Cache
}

func NewUseCase(deps Deps, tokenCache *tokencache.Cache) *UseCase {
	return &UseCase{deps: deps, tokenCache: tokenCache}
}

// Execute revokes one minted credential.
//
// Like the mint, the tenant comes from targetorg rather than from an argument, and
// the parent link comes from the signed JWT by way of the principal -- neither is
// client-nameable here.
func (h *UseCase) Execute(ctx context.Context, tokenSlug string) error {
	caller, ok := principal.FromContext(ctx)
	if !ok || !caller.IsPlatform() {
		// Unreachable through the facade, which settles the credential class in the
		// type of its caller argument; stated so a wiring mistake fails closed
		// rather than revoking with a zero PlatformTokenID, which would match
		// nothing but should not be reached at all.
		return apierrors.Forbidden(
			"RevokeOrganizationToken.WrongCredentialKind",
			"this operation requires a platform credential",
		)
	}

	organizationID, ok := targetorg.FromContext(ctx)
	if !ok {
		return apierrors.Internal(
			"RevokeOrganizationToken.MissingTargetOrganization",
			"the target organization was not resolved for this request",
		)
	}

	row, err := h.deps.Queries.RevokeSystemOrganizationTokenBySlug(ctx, db.RevokeSystemOrganizationTokenBySlugParams{
		TokenSlug:       tokenSlug,
		OrganizationID:  organizationID,
		PlatformTokenID: caller.PlatformTokenID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// One answer for all four ways to miss -- no such slug, already
			// revoked, another tenant's, another platform credential's child --
			// because distinguishing them would let a caller enumerate credentials
			// it has no business seeing.
			return apierrors.NotFound(
				"RevokeOrganizationToken.NotFound",
				"no active credential with that slug was issued by this platform credential in this organization",
			)
		}
		return fmt.Errorf("failed to revoke the minted organization credential: %w", err)
	}

	h.tokenCache.Delete(row.LookupHash)

	// Best-effort, same contract as deletetokenonserviceaccount: the row is
	// already revoked and this process's cache is already evicted, so a failure
	// here only means other replicas may serve the cached JWT until its TTL
	// expires.
	if err := pgnotify.Publish(ctx, h.deps.Pool, deletetokenonserviceaccount.TokenCacheInvalidationChannel, row.LookupHash); err != nil {
		slog.WarnContext(ctx, "failed to publish token cache invalidation", "error", err)
	}

	return nil
}
