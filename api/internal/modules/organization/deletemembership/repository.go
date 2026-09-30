package deletemembership

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

func (r *CommandRepository) DeleteMembership(ctx context.Context, organizationID, userID uuid.UUID) (bool, error) {
	tag, err := r.repository.DeleteUserOnOrganization(ctx, db.DeleteUserOnOrganizationParams{
		UserID:         userID,
		OrganizationID: organizationID,
	})
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
