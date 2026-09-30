package getmetadatafields

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/listcursor"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
)

type QueryRepository struct {
	queries *db.Queries
}

func NewQueryRepository(queries *db.Queries) *QueryRepository {
	return &QueryRepository{queries: queries}
}

func (r *QueryRepository) ListMetadataFields(
	ctx context.Context,
	resourceType db.MetadataFieldResourceType,
	orgID uuid.UUID,
	limitPlusOne int32,
	cursor *listcursor.Key,
) ([]*schema.MetadataField, error) {
	var cursorDisplayOrder *int32
	var cursorCreatedAt *time.Time
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorDisplayOrder = &cursor.DisplayOrder
		cursorCreatedAt = &cursor.CreatedAt
		cursorID = &cursor.ID
	}

	rows, err := r.queries.ListMetadataFieldsByResourceType(ctx, db.ListMetadataFieldsByResourceTypeParams{
		OrganizationID:     orgID,
		ResourceType:       resourceType,
		CursorDisplayOrder: cursorDisplayOrder,
		CursorCreatedAt:    pgtime.TimePtrToPgTimestamp(cursorCreatedAt),
		CursorID:           cursorID,
		LimitPlusOne:       limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	out := make([]*schema.MetadataField, 0, len(rows))
	for _, row := range rows {
		dto, err := dbmap.ToMetadataField(row)
		if err != nil {
			return nil, err
		}
		out = append(out, dto)
	}
	return out, nil
}
