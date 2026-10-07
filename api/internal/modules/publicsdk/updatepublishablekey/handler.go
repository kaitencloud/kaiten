package updatepublishablekey

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/keys"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UpdatePublishableKey"

// Patch is what may change on a key. An absent member is left as it is; an
// empty allowedOrigins removes every browser origin.
type PublishableKeyPatch struct {
	Label          *string   `json:"label,omitempty" minLength:"1" maxLength:"100" doc:"What the key is for"`
	AllowedOrigins *[]string `json:"allowedOrigins,omitempty" maxItems:"50" doc:"Replaces the allowed browser origins. Takes effect on the next request."`
}

type UseCase struct{ deps keys.Deps }

func NewUseCase(deps keys.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute changes a live key's label or origins. A revoked key cannot change.
func (u *UseCase) Execute(ctx context.Context, keyID uuid.UUID, patch PublishableKeyPatch) (*keys.PublishableKey, error) {
	user, err := u.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	params := db.UpdatePublishableKeyParams{
		Label: nil, AllowedOrigins: nil, ActorID: user.ID, OrganizationID: user.OrganizationID, ID: keyID,
	}
	if patch.Label != nil {
		label, err := keys.ValidateLabel(operation, *patch.Label)
		if err != nil {
			return nil, err
		}
		params.Label = &label
	}
	if patch.AllowedOrigins != nil {
		origins, err := keys.NormalizeOrigins(operation, *patch.AllowedOrigins)
		if err != nil {
			return nil, err
		}
		params.AllowedOrigins = origins
	}

	var updated keys.PublishableKey
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		current, err := q.GetPublishableKeyForUpdate(ctx, db.GetPublishableKeyForUpdateParams{
			OrganizationID: user.OrganizationID, ID: keyID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return keys.NotFound(operation, keyID)
		}
		if err != nil {
			return err
		}
		if current.RevokedAt.Valid {
			return kaitenerrors.Conflict(operation+".Revoked", "a revoked publishable key cannot be changed")
		}
		row, err := q.UpdatePublishableKey(ctx, params)
		if err != nil {
			return err
		}
		updated = keys.FromRow(row.ID, row.Label, row.KeyHint, row.AllowedOrigins,
			row.LastUsedAt, row.CreatedAt, row.UpdatedAt, row.RevokedAt)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}
