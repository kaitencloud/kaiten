package listlicensefamilies

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

// ListFamilies returns one page of families, each with the version it currently
// resolves to.
//
// Two queries, not a join: the page of families, then the current version of
// every family on it. Resolving in a LEFT JOIN would make each license column
// nullable for the sake of families with nothing published, and resolving per
// family would be one query per row. This is bounded -- one extra round trip per
// page, whatever the page size.
func (r *QueryRepository) ListFamilies(
	ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.CreatedAtCursor,
) ([]*schema.LicenseFamilyView, error) {
	var (
		cursorCreatedAt pgtype.Timestamp
		cursorID        *uuid.UUID
	)
	if cursor != nil {
		cursorCreatedAt = pgtime.TimePtrToPgTimestamp(&cursor.CreatedAt)
		cursorID = &cursor.ID
	}

	rows, err := r.repository.ListLicenseFamiliesByCursor(ctx, db.ListLicenseFamiliesByCursorParams{
		OrganizationID:  organizationID,
		CursorCreatedAt: cursorCreatedAt,
		CursorID:        cursorID,
		LimitPlusOne:    limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	families := make([]*schema.LicenseFamilyView, 0, len(rows))
	familyIDs := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		families = append(families, &schema.LicenseFamilyView{
			ID:           row.ID,
			Slug:         row.Slug,
			VersionCount: row.VersionCount,
			IsPublic:     row.IsPublic,
			CreatedAt:    row.CreatedAt.Time,
			UpdatedAt:    row.UpdatedAt.Time,
		})
		familyIDs = append(familyIDs, row.ID)
	}

	if len(familyIDs) == 0 {
		return families, nil
	}

	current, err := r.repository.GetCurrentLicenseVersionsByFamilyIDs(ctx, db.GetCurrentLicenseVersionsByFamilyIDsParams{
		OrganizationID: organizationID,
		FamilyIds:      familyIDs,
	})
	if err != nil {
		return nil, err
	}

	// At most one row per family, since the query is DISTINCT ON (family_id), and
	// none at all for a family with nothing published -- which is why the field
	// stays nil rather than being filled with a placeholder.
	byFamily := make(map[uuid.UUID]*schema.License, len(current))
	for i := range current {
		license, err := dbmap.ToLicense(&current[i])
		if err != nil {
			return nil, err
		}
		byFamily[current[i].FamilyID] = license
	}

	for _, family := range families {
		if license, ok := byFamily[family.ID]; ok {
			family.CurrentVersion = license
		}
	}

	return families, nil
}
