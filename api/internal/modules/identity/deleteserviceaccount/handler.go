package deleteserviceaccount

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/deletetokenonserviceaccount"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/tokencache"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// NotFoundCode is what a delete answers when the organization holds no live
// service account under the slug: the code every other service-account
// operation uses.
const NotFoundCode = "ServiceAccount.NotFound"

// Deps lists exactly what this handler needs. Pool carries the post-commit
// NOTIFY only, as in deletetokenonserviceaccount.
type Deps struct {
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
	Pool         *pgxpool.Pool
	// StockReporter sets the service-accounts entitlement to the number the
	// organization still holds. Nil sets nothing (self-hosted, unit tests).
	StockReporter services.StockReporter
}

type UseCase struct {
	deps       Deps
	tokenCache *tokencache.Cache
}

func NewUseCase(deps Deps, tokenCache *tokencache.Cache) *UseCase {
	return &UseCase{deps: deps, tokenCache: tokenCache}
}

// Execute deletes a service account of the caller's organization.
//
// The account is soft-deleted, as a human user is: its row is the author of
// every row it wrote, and that attribution outlives it. Every token it still
// holds is revoked in the same transaction, then evicted from this replica's
// credential cache and, through NOTIFY, from the others'. Its slug is free for a
// new account from then on.
//
// On a deployment licensed by a licensing authority, the service-accounts
// entitlement is then set to the number the organization still holds, so a
// Starter organization can replace its one account. Best effort, like the
// counter a create sets back after a failure: the account is gone either way,
// and the next create sets the counter from the database again.
func (h *UseCase) Execute(ctx context.Context, slug string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return fmt.Errorf("get user: %w", err)
	}

	var lookupHashes []string
	var held int64
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(h.deps.Uof.DBTX(ctx))

		id, err := q.SoftDeleteServiceAccount(ctx, db.SoftDeleteServiceAccountParams{
			ServiceAccountSlug: &slug,
			OrganizationID:     user.OrganizationID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFound(NotFoundCode,
				fmt.Sprintf("ServiceAccount with slug %s not found in organization %s", slug, user.OrganizationID))
		}
		if err != nil {
			return fmt.Errorf("delete service account: %w", err)
		}

		lookupHashes, err = q.RevokeTokensForServiceAccount(ctx, db.RevokeTokensForServiceAccountParams{
			RevokerID:        &user.ID,
			ServiceAccountID: id,
			OrganizationID:   user.OrganizationID,
		})
		if err != nil {
			return fmt.Errorf("revoke service account tokens: %w", err)
		}

		held, err = q.CountServiceAccounts(ctx, user.OrganizationID)
		if err != nil {
			return fmt.Errorf("count service accounts: %w", err)
		}
		return nil
	})
	if err != nil {
		return err
	}

	for _, lookupHash := range lookupHashes {
		h.tokenCache.Delete(lookupHash)
		// Best effort, as for one token: the tokens are revoked and the account
		// deleted in the database, which every validation checks; the only
		// exposure is another replica serving a cached credential until its TTL.
		if err := pgnotify.Publish(ctx, h.deps.Pool, deletetokenonserviceaccount.TokenCacheInvalidationChannel, lookupHash); err != nil {
			slog.WarnContext(ctx, "failed to publish token cache invalidation", "error", err)
		}
	}

	dogfooding.SyncStock(ctx, h.deps.StockReporter, user.OrganizationID,
		dogfooding.ServiceAccountEntitlementSlug, held)
	return nil
}
