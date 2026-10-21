package familyview

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
)

// FallbackSlugs resolves the fallback families the given ids name to their
// slugs, in one query. A nil id names none; the map holds the others.
func FallbackSlugs(ctx context.Context, q *db.Queries, organizationID uuid.UUID, ids ...*uuid.UUID) (map[uuid.UUID]string, error) {
	wanted := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if id != nil {
			wanted = append(wanted, *id)
		}
	}
	slugs := make(map[uuid.UUID]string, len(wanted))
	if len(wanted) == 0 {
		return slugs, nil
	}
	rows, err := q.GetLicenseFamilySlugsByIDs(ctx, db.GetLicenseFamilySlugsByIDsParams{OrganizationID: organizationID, FamilyIds: wanted})
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		slugs[row.ID] = row.Slug
	}
	return slugs, nil
}

// SlugOf is the slug a fallback id resolves to in slugs, nil without a
// fallback.
func SlugOf(slugs map[uuid.UUID]string, id *uuid.UUID) *string {
	if id == nil {
		return nil
	}
	if slug, ok := slugs[*id]; ok {
		return &slug
	}
	return nil
}
