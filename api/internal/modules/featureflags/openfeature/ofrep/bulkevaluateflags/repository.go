package bulkevaluateflags

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetAllFeatureFlags(ctx context.Context, organizationID uuid.UUID) ([]schema.FeatureFlag, error) {
	flags, err := r.repository.GetFeatureFlags(ctx, organizationID)
	if err != nil {
		return nil, err
	}

	if len(flags) == 0 {
		return nil, kaitenerrors.NotFound("GetAllFeatureFlags.NotFound", fmt.Sprintf("No feature flags found for organization %s", organizationID))
	}

	return r.mapToFeatureFlags(flags)
}

func (r *QueryRepository) GetFeatureFlagsBySlugs(ctx context.Context, slugs []string, organizationID uuid.UUID) ([]schema.FeatureFlag, error) {
	params := db.GetFeatureFlagsBySlugsParams{
		FeatureFlagSlugs: slugs,
		OrganizationID:   organizationID,
	}

	flags, err := r.repository.GetFeatureFlagsBySlugs(ctx, params)
	if err != nil {
		return nil, err
	}

	if len(flags) == 0 {
		return nil, kaitenerrors.NotFound("GetFeatureFlagsBySlugs.NotFound", fmt.Sprintf("No feature flags found for slugs %v and organization %s", slugs, organizationID))
	}

	return r.mapToFeatureFlags(flags)
}

func (r *QueryRepository) mapToFeatureFlags(flags []db.FeatureFlag) ([]schema.FeatureFlag, error) {
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
