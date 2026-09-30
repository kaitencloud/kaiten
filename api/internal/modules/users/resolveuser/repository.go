package resolveuser

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/users/infrastructure/db"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{repository: repository}
}

// ResolveUser returns the user's internal id and whether a row was found.
//
// A bool rather than pgx.ErrNoRows reaching the handler: "there is no such user" is
// an outcome of this operation, not a failure of the driver, and the handler is the
// place that decides what to say about it.
func (r *QueryRepository) ResolveUser(ctx context.Context, externalID string) (uuid.UUID, bool, error) {
	user, err := r.repository.GetUserByExternalID(ctx, externalID)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, false, nil
	}
	if err != nil {
		return uuid.Nil, false, fmt.Errorf("resolve user: %w", err)
	}

	return user.ID, true, nil
}
