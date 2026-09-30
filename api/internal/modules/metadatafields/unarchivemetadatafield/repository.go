package unarchivemetadatafield

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

func (r *CommandRepository) UnarchiveMetadataField(
	ctx context.Context,
	id uuid.UUID,
	orgID uuid.UUID,
	userID uuid.UUID,
) (*schema.MetadataField, error) {
	row, err := r.q(ctx).UnarchiveMetadataField(ctx, db.UnarchiveMetadataFieldParams{
		ID:             id,
		OrganizationID: orgID,
		UserID:         userID,
	})
	if err != nil {
		// The partial unique index uq_metadata_field_key_active only covers
		// non-archived rows, so re-activating a field whose key has since been
		// taken by an active field collides — surface it as a 409 the admin can
		// act on (rename/archive the active field first).
		if kaitenerrors.IsUniqueViolation(err) {
			return nil, kaitenerrors.Conflict(
				"UnarchiveMetadataField.KeyConflict",
				"cannot unarchive: an active metadata field already uses this key for this resource type",
			)
		}
		if errors.Is(err, pgx.ErrNoRows) {
			// Either the field doesn't exist, or it isn't archived (the
			// UPDATE's WHERE archived_at IS NOT NULL guard skipped it). Both
			// collapse to 404 to keep the API contract simple.
			return nil, kaitenerrors.NotFound(
				"UnarchiveMetadataField.NotFound",
				fmt.Sprintf("metadata field %s not found or not archived", id),
			)
		}
		return nil, err
	}
	return dbmap.ToMetadataField(row)
}
