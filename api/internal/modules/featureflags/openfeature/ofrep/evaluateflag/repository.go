package evaluateflag

import (
	"context"
	"database/sql"
	"errors"
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

func (r *QueryRepository) GetFeatureFlag(ctx context.Context, name string, organizationID uuid.UUID) (*schema.FeatureFlag, error) {
	params := db.GetFeatureFlagBySlugParams{
		FeatureFlagSlug: name,
		OrganizationID:  organizationID,
	}

	flag, err := r.repository.GetFeatureFlagBySlug(ctx, params)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, kaitenerrors.NotFound("GetFeatureFlag.NotFound", fmt.Sprintf("Feature flag with name %s not found", name))
		}
		return nil, err
	}

	return dbmap.ToFeatureFlag(flag)
}
