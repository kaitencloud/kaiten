package getfeatureflag

import (
	"context"
	"database/sql"
	"errors"

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

func (r *QueryRepository) GetFeatureFlag(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.FeatureFlag, error) {
	params := db.GetFeatureFlagBySlugParams{
		FeatureFlagSlug: slug,
		OrganizationID:  organizationID,
	}

	flag, err := r.repository.GetFeatureFlagBySlug(ctx, params)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, kaitenerrors.NotFoundf("GetFeatureFlag.NotFound", "Feature flag with slug %s not found", slug)
		}
		return nil, err
	}

	return dbmap.ToFeatureFlag(flag)
}
