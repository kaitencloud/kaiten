package deleteuser

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
)

type CommandRepository struct {
	repository *db.Queries
}

func NewCommandRepository(repository *db.Queries) *CommandRepository {
	return &CommandRepository{repository: repository}
}

func (r *CommandRepository) DeleteUser(ctx context.Context, userID uuid.UUID) (bool, error) {
	tag, err := r.repository.DeleteUser(ctx, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}
