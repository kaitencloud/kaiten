package getfeatureflags

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetFeatureFlags(ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.IDCursor) ([]schema.FeatureFlag, error) {
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorID = &cursor.ID
	}

	flags, err := r.repository.GetFeatureFlagsByCursor(ctx, db.GetFeatureFlagsByCursorParams{
		OrganizationID: organizationID,
		CursorID:       cursorID,
		LimitPlusOne:   limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	result := make([]schema.FeatureFlag, 0, len(flags))
	for _, flag := range flags {
		f, err := dbmap.ToFeatureFlag(flag)
		if err != nil {
			return nil, err
		}

		result = append(result, *f)
	}

	return result, nil
}
