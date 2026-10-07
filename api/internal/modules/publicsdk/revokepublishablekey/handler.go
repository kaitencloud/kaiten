package revokepublishablekey

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
)

const operation = "RevokePublishableKey"

type UseCase struct{ deps keys.Deps }

func NewUseCase(deps keys.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute revokes a key. It stops authenticating on the next request: keys
// are looked up on every request, never cached. Revoking twice is a no-op
// that answers the first revocation.
func (u *UseCase) Execute(ctx context.Context, keyID uuid.UUID) (*keys.PublishableKey, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	row, err := u.deps.Queries(ctx).RevokePublishableKey(ctx, db.RevokePublishableKeyParams{
		ActorID: user.ID, OrganizationID: user.OrganizationID, ID: keyID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, keys.NotFound(operation, keyID)
	}
	if err != nil {
		return nil, err
	}
	revoked := keys.FromRow(row.ID, row.Label, row.KeyHint, row.AllowedOrigins,
		row.LastUsedAt, row.CreatedAt, row.UpdatedAt, row.RevokedAt)
	return &revoked, nil
}
