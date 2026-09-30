package addmembership

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

func (r *CommandRepository) CreateUserOnOrganization(ctx context.Context, userID, organizationID uuid.UUID) error {
	_, err := r.repository.CreateUserOnOrganization(ctx, db.CreateUserOnOrganizationParams{
		UserID:         userID,
		OrganizationID: organizationID,
	})
	return err
}
