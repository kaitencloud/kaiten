package revokepublishablekey

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
)

const operation = "RevokePublishableKey"

type UseCase struct {
	deps   keys.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps keys.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute revokes a key. It stops authenticating on the next request: keys
// are looked up on every request, never cached. Revoking twice is a no-op
// that answers the first revocation; PUBLISHABLE_KEY_REVOKED is recorded
// once, by the revocation that took the key out of service.
func (u *UseCase) Execute(ctx context.Context, keyID uuid.UUID) (*keys.PublishableKey, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var revoked keys.PublishableKey
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		before, err := q.GetPublishableKeyForUpdate(ctx, db.GetPublishableKeyForUpdateParams{OrganizationID: user.OrganizationID, ID: keyID})
		if errors.Is(err, pgx.ErrNoRows) {
			return keys.NotFound(operation, keyID)
		}
		if err != nil {
			return err
		}
		row, err := q.RevokePublishableKey(ctx, db.RevokePublishableKeyParams{
			ActorID: user.ID, OrganizationID: user.OrganizationID, ID: keyID,
		})
		if err != nil {
			return err
		}
		revoked = keys.FromRow(row.ID, row.Label, row.KeyHint, row.AllowedOrigins,
			row.LastUsedAt, row.CreatedAt, row.UpdatedAt, row.RevokedAt)
		if before.RevokedAt.Valid {
			return nil
		}
		return keys.Announce(ctx, u.outbox, user.OrganizationID, events.PublishableKeyRevoked, revoked)
	})
	if err != nil {
		return nil, err
	}
	return &revoked, nil
}
