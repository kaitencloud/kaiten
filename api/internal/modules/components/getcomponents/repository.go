package getcomponents

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/infrastructure/db"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{repository: repository}
}

func (r *QueryRepository) GetComponents(ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.CreatedAtCursor) ([]*componentschema.Component, error) {
	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorCreatedAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	rows, err := r.repository.GetComponents(ctx, db.GetComponentsParams{
		OrganizationID:  organizationID,
		CursorCreatedAt: pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:        cursorID,
		LimitPlusOne:    limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	components := make([]*componentschema.Component, 0, len(rows))
	for _, row := range rows {
		components = append(components, &componentschema.Component{
			ID:                  row.ID,
			PreviousComponentID: row.PreviousComponentID,
			Name:                row.Name,
			Version:             row.Version,
			Slug:                row.Slug,
			Description:         row.Description,
			CreatedBy:           shared.User{ID: row.CreatedByID, Name: row.CreatedByName},
			CreatedAt:           row.CreatedAt.Time,
		})
	}

	return components, nil
}
