package reordermetadatafields

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
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

// ReorderMetadataFields applies the new display_order in two passes:
//
//  1. Load all referenced rows in one query (org-scoped, non-archived).
//     Verify the loaded count matches the input count — if not, at least
//     one id is missing, archived, or belongs to another org.
//  2. Verify all loaded rows share the same resource_type. Reordering
//     across resource types makes no UI sense and would scramble the
//     display order of an unrelated set.
//  3. Issue one UPDATE per id, asserting RowsAffected == 1 each time.
//     Inside the surrounding transaction this reads atomically.
func (r *CommandRepository) ReorderMetadataFields(
	ctx context.Context,
	ids []uuid.UUID,
	orgID uuid.UUID,
	userID uuid.UUID,
) (db.MetadataFieldResourceType, error) {
	queries := r.q(ctx)

	rows, err := queries.ListActiveMetadataFieldsByIDs(ctx, db.ListActiveMetadataFieldsByIDsParams{
		OrganizationID: orgID,
		Ids:            ids,
	})
	if err != nil {
		return "", err
	}

	if len(rows) != len(ids) {
		return "", kaitenerrors.NotFound(
			"ReorderMetadataFields.UnknownID",
			fmt.Sprintf("expected %d active metadata fields, found %d — some ids are missing, archived, or belong to another organization", len(ids), len(rows)),
		)
	}

	// Verify single resource_type. We can pick the first row's type as the
	// reference; any divergence is a violation. The expected type also feeds
	// the validator-cache invalidation in the handler.
	expectedType := rows[0].ResourceType
	for _, row := range rows {
		if row.ResourceType != expectedType {
			return "", kaitenerrors.UnprocessableEntity(
				"ReorderMetadataFields.MixedResourceTypes",
				"all ids in a reorder must belong to the same resource type",
			)
		}
	}

	for idx, id := range ids {
		n, err := queries.ReorderMetadataField(ctx, db.ReorderMetadataFieldParams{
			ID:             id,
			OrganizationID: orgID,
			DisplayOrder:   int32(idx),
			UserID:         userID,
		})
		if err != nil {
			return "", err
		}
		// Defensive: archived_at IS NULL on the WHERE clause means a row
		// archived between the SELECT and the UPDATE would skip silently.
		// Treat that as a 404 too so the API contract stays strict.
		if n == 0 {
			return "", kaitenerrors.NotFound(
				"ReorderMetadataFields.UnknownID",
				fmt.Sprintf("metadata field %s could not be reordered (archived between read and write?)", id),
			)
		}
	}
	return expectedType, nil
}
