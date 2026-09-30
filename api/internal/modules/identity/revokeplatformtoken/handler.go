// Package revokeplatformtoken retires a platform credential and, with it, every
// organization credential that credential ever issued.
//
// It has no endpoint.go, and could not have one. A platform credential is what
// authenticates the Platform API, so an operation that retires one cannot be an
// operation of that API: revoking the credential you are calling with would end
// the request that asked for it, and revoking a *different* one means enumerating
// credentials the Platform API deliberately cannot see. The counterpart that does
// belong on the wire is revokeorganizationtoken, which retires one *child* --
// named by slug, scoped to the caller's own issuance, and unable to reach a
// sibling. Reachable only through kaiten.InProcess.
//
// This is the cascade side of that pair: retiring a parent retires its children,
// so an operator who rotates a platform credential does not leave behind live
// tenant credentials it minted.
package revokeplatformtoken

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/deletetokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokencache"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
//
// Uof rather than a pool-bound *db.Queries, unlike this module's read paths: the
// parent's revocation and its children's are one unit. A committed parent whose
// children survived would leave live credentials whose authority nothing can
// revoke by name any more, and a committed child list whose parent survived would
// retire a tenant's credentials while the thing that issued them still works.
// Neither half is acceptable alone, so the queries are resolved per call from
// whichever DBTX is active (see q).
type Deps struct {
	Uof *uow.UnitOfWork
}

type UseCase struct {
	deps       Deps
	tokenCache *tokencache.Cache
}

func NewUseCase(deps Deps, tokenCache *tokencache.Cache) *UseCase {
	return &UseCase{deps: deps, tokenCache: tokenCache}
}

// q resolves the sqlc queries bound to whatever DBTX is active for ctx -- the
// transaction Transact opened, or the pool when there is none. Same idiom as
// mintorganizationtoken.
func (h *UseCase) q(ctx context.Context) *db.Queries {
	return db.New(h.deps.Uof.DBTX(ctx))
}

// Execute revokes the platform credential named name, and returns how many
// credentials were retired in total -- the parent plus each token it had issued.
//
// Naming a credential rather than addressing it by id or slug is what an operator
// has: they created it by name, and names are unique among *active* platform
// credentials, so a name identifies at most one revocable row. The count is
// returned rather than logged because it is the operator's confirmation that the
// cascade did what they expected; subtracting one from it gives the number of
// tenant credentials that stopped working.
//
// Not finding an active credential with that name is an error here, and is not in
// RevokeIfActive. The difference is the caller's intent: an operator who names a
// credential to revoke has said one exists, and silently succeeding would tell
// them a rotation happened when nothing was retired.
func (h *UseCase) Execute(ctx context.Context, name string) (int, error) {
	revoked, err := h.RevokeIfActive(ctx, name)
	if err != nil {
		return 0, err
	}
	if revoked == 0 {
		// Nothing was written when the count is zero -- the parent's UPDATE matched
		// no row -- so there is no transaction to unwind, and this refusal is
		// deliberately raised outside one.
		return 0, apierrors.NotFound(
			"RevokePlatformToken.NotFound",
			fmt.Sprintf("no active platform token named %q", name),
		)
	}

	return revoked, nil
}

// RevokeIfActive is Execute without the "it must exist" rule: zero revoked rows is
// a valid outcome, reported as a count rather than an error.
//
// It exists for createplatformtoken's --replace, which retires the active
// credential of that name before writing its successor and must not care whether
// there was one. Composing that from Execute would mean treating its NotFound as
// success, which is the shape that hides a genuine failure the first time the
// query changes.
//
// Safe both standalone and nested: Transact joins an existing transaction, so
// --replace gets the retirement and the insert in one unit, while an operator
// revoking directly gets the parent and its children in one of their own.
func (h *UseCase) RevokeIfActive(ctx context.Context, name string) (int, error) {
	var revoked int

	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		queries := h.q(ctx)

		parent, err := queries.RevokePlatformTokenByName(ctx, name)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// No active credential by that name: nothing to revoke, nothing to
				// cascade, nothing to evict. Whether that is acceptable is the
				// caller's call, which is the whole reason this method exists.
				return nil
			}
			return fmt.Errorf("failed to revoke the platform credential %q: %w", name, err)
		}

		// The cascade, in the same transaction as the parent's revocation: a child
		// that outlived its parent would be authority nothing can name.
		children, err := queries.RevokeTokensIssuedByPlatformToken(ctx, parent.ID)
		if err != nil {
			return fmt.Errorf("failed to revoke the credentials issued by %q: %w", name, err)
		}

		lookupHashes := make([]string, 0, len(children)+1)
		lookupHashes = append(lookupHashes, parent.LookupHash)
		for _, child := range children {
			lookupHashes = append(lookupHashes, child.LookupHash)
		}

		h.evict(ctx, lookupHashes)

		revoked = len(lookupHashes)
		return nil
	})
	if err != nil {
		return 0, err
	}

	return revoked, nil
}

// evict drops each revoked credential from this process's validation cache and
// asks every other instance to do the same.
//
// The local delete happens before the transaction commits, and that ordering is
// fail-safe rather than premature: a cache miss revalidates against the database,
// so evicting a credential whose revocation is later rolled back costs one query,
// while keeping it would serve a revoked credential for the rest of its TTL.
//
// The NOTIFY goes through the transaction's own handle, so Postgres holds the
// notifications until it commits and discards them if it rolls back -- a
// revocation is never announced before it is true. Best effort, the same contract
// deletetokenonserviceaccount and revokeorganizationtoken keep: the row is
// revoked either way, and a failure here only means another replica may serve the
// credential from cache until its entry expires.
func (h *UseCase) evict(ctx context.Context, lookupHashes []string) {
	dbtx := h.deps.Uof.DBTX(ctx)

	for _, lookupHash := range lookupHashes {
		h.tokenCache.Delete(lookupHash)

		if err := pgnotify.Publish(ctx, dbtx,
			deletetokenonserviceaccount.TokenCacheInvalidationChannel, lookupHash); err != nil {
			slog.WarnContext(ctx, "failed to publish token cache invalidation; "+
				"the credential is revoked, but a running API may serve it from cache until the entry expires",
				"error", err)
		}
	}
}
