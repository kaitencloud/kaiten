package getlicenses

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
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

func (r *QueryRepository) GetLicenses(ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.CreatedAtCursor) ([]*schema.License, error) {
	var (
		cursorCreatedAt pgtype.Timestamp
		cursorID        *uuid.UUID
	)
	if cursor != nil {
		cursorCreatedAt = pgtime.TimePtrToPgTimestamp(&cursor.CreatedAt)
		cursorID = &cursor.ID
	}

	results, err := r.repository.GetAllLicensesByCursor(ctx, db.GetAllLicensesByCursorParams{
		OrganizationID:  organizationID,
		CursorCreatedAt: cursorCreatedAt,
		CursorID:        cursorID,
		LimitPlusOne:    limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	licenses := make([]*schema.License, 0)

	// The row is handed to the mapper as-is. Copying it field by field into a
	// fresh db.License first translates nothing -- GetAllLicensesByCursor already
	// returns the model type -- and leaves every column added to license silently
	// absent from this endpoint until someone extends the copy.
	for _, l := range results {
		license, err := dbmap.ToLicense(&l)
		if err != nil {
			return nil, err
		}

		licenses = append(licenses, license)
	}

	return licenses, nil
}
