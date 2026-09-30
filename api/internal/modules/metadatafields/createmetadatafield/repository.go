package createmetadatafield

import (
	"context"
	"fmt"

	"github.com/google/uuid"

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

func (r *CommandRepository) CreateMetadataField(
	ctx context.Context,
	command *CreateMetadataFieldInput,
	schemaBytes []byte,
	orgID uuid.UUID,
	userID uuid.UUID,
) (*schema.MetadataField, error) {
	row, err := r.q(ctx).InsertMetadataField(ctx, db.InsertMetadataFieldParams{
		OrganizationID: orgID,
		ResourceType:   command.ResourceType,
		Key:            command.Key,
		Label:          command.Label,
		JsonSchema:     schemaBytes,
		DisplayOrder:   command.DisplayOrder,
		UserID:         userID,
	})
	if err != nil {
		if kaitenerrors.IsUniqueViolation(err) {
			return nil, kaitenerrors.Conflict(
				"CreateMetadataField.KeyConflict",
				fmt.Sprintf("metadata field with key %q already exists for resource type %s in this organization", command.Key, command.ResourceType),
			)
		}
		return nil, err
	}

	return dbmap.ToMetadataField(row)
}
