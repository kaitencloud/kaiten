package archivemetadatafield

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

func (r *CommandRepository) ArchiveMetadataField(
	ctx context.Context,
	id uuid.UUID,
	orgID uuid.UUID,
	userID uuid.UUID,
) (*schema.MetadataField, error) {
	row, err := r.q(ctx).ArchiveMetadataField(ctx, db.ArchiveMetadataFieldParams{
		ID:             id,
		OrganizationID: orgID,
		UserID:         userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Either the field doesn't exist, or it's already archived
			// (the UPDATE's WHERE archived_at IS NULL guard would skip it).
			// Both cases are reported as 404 to keep the API contract simple.
			return nil, kaitenerrors.NotFound(
				"ArchiveMetadataField.NotFound",
				fmt.Sprintf("metadata field %s not found or already archived", id),
			)
		}
		return nil, err
	}
	return dbmap.ToMetadataField(row)
}
