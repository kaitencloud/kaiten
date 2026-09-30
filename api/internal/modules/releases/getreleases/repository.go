package getreleases

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetReleases(ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.CreatedAtCursor) ([]*schema.Release, error) {
	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorCreatedAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	result, err := r.repository.GetReleases(ctx, db.GetReleasesParams{
		OrganizationID:  organizationID,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	releases := make([]*schema.Release, 0)

	for _, rl := range result {
		releases = append(releases, &schema.Release{
			ID:          rl.ID,
			Version:     rl.Version,
			Slug:        rl.Slug,
			Description: rl.Description,
			CreatedBy:   shared.User{ID: rl.CreatedByID, Name: rl.CreatedByName},
			CreatedAt:   rl.CreatedAt.Time,
		})
	}

	return releases, nil
}
