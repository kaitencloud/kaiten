package deleteorganization

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/organization/infrastructure/db"
)

type CommandRepository struct {
	repository *db.Queries
}

func NewCommandRepository(repository *db.Queries) *CommandRepository {
	return &CommandRepository{repository: repository}
}

func (r *CommandRepository) DeleteOrganization(ctx context.Context, organizationID uuid.UUID) (bool, error) {
	tag, err := r.repository.DeleteOrganization(ctx, organizationID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
