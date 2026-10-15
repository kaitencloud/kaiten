package getreleases

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/releaselink"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

type QueryRepository struct {
	repository    *db.Queries
	componentLink releaselink.Port
}

func NewQueryRepository(repository *db.Queries, componentLink releaselink.Port) *QueryRepository {
	return &QueryRepository{
		repository:    repository,
		componentLink: componentLink,
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

	// Components are the read view of a release, here as in get-release: one
	// query for the whole page, however many releases it holds.
	ids := make([]uuid.UUID, len(result))
	for i, rl := range result {
		ids[i] = rl.ID
	}
	components, err := r.componentLink.GetComponentsByReleaseIDs(ctx, ids, organizationID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch components: %w", err)
	}

	releases := make([]*schema.Release, 0, len(result))

	for _, rl := range result {
		releases = append(releases, &schema.Release{
			ID:          rl.ID,
			Version:     rl.Version,
			Slug:        rl.Slug,
			Description: rl.Description,
			CreatedBy:   shared.User{ID: rl.CreatedByID, Name: rl.CreatedByName},
			CreatedAt:   rl.CreatedAt.Time,
			Components:  components[rl.ID],
		})
	}

	return releases, nil
}
