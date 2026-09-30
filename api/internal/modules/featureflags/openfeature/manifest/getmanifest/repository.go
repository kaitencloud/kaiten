package getmanifest

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
)

type Repository interface {
	GetAllFeatureFlags(ctx context.Context, orgID uuid.UUID) ([]schema.FeatureFlag, error)
}

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetAllFeatureFlags(ctx context.Context, orgID uuid.UUID) ([]schema.FeatureFlag, error) {
	flags, err := r.repository.GetFeatureFlags(ctx, orgID)
	if err != nil {
		return nil, err
	}

	result := make([]schema.FeatureFlag, 0, len(flags))
	for _, flag := range flags {
		ff, err := dbmap.ToFeatureFlag(flag)
		if err != nil {
			return nil, err
		}
		result = append(result, *ff)
	}

	return result, nil
}
