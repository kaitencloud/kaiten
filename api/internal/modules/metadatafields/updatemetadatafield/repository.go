package updatemetadatafield

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

func (r *CommandRepository) GetMetadataField(ctx context.Context, id uuid.UUID, orgID uuid.UUID) (db.MetadataField, error) {
	return r.q(ctx).GetMetadataField(ctx, db.GetMetadataFieldParams{
		ID:             id,
		OrganizationID: orgID,
	})
}

func (r *CommandRepository) UpdateMetadataField(
	ctx context.Context,
	command *UpdateMetadataFieldInput,
	schemaBytes []byte,
	orgID uuid.UUID,
	userID uuid.UUID,
) (*schema.MetadataField, error) {
	row, err := r.q(ctx).UpdateMetadataField(ctx, db.UpdateMetadataFieldParams{
		ID:             command.ID,
		OrganizationID: orgID,
		Label:          command.Label,
		JsonSchema:     schemaBytes,
		UserID:         userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Either the field doesn't exist or was archived between the
			// GetMetadataField check and the UPDATE. Both map to a 404.
			return nil, kaitenerrors.NotFound(
				"UpdateMetadataField.NotFound",
				fmt.Sprintf("metadata field %s not found or archived", command.ID),
			)
		}
		return nil, err
	}
	return dbmap.ToMetadataField(row)
}
