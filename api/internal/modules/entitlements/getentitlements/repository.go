package getentitlements

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
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

func (r *QueryRepository) GetEntitlements(ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.CreatedAtCursor) ([]*schema.Entitlement, error) {
	var (
		cursorCreatedAt pgtype.Timestamp
		cursorID        *uuid.UUID
	)
	if cursor != nil {
		cursorCreatedAt = pgtime.TimePtrToPgTimestamp(&cursor.CreatedAt)
		cursorID = &cursor.ID
	}

	entitlements, err := r.repository.GetEntitlementsByCursor(ctx, db.GetEntitlementsByCursorParams{
		OrganizationID:  organizationID,
		CursorCreatedAt: cursorCreatedAt,
		CursorID:        cursorID,
		LimitPlusOne:    limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	// Group refs are looked up for the whole organization rather than just
	// the current page: this is a single indexed lookup keyed by slug, not
	// itself a list-facing endpoint, and its size is bounded by the number
	// of entitlement-group memberships in the organization, not the number
	// of entitlements.
	groupRows, err := r.repository.GetEntitlementGroupsForOrganizationEntitlements(ctx, organizationID)
	if err != nil {
		return nil, err
	}

	groupsBySlug := make(map[string][]*schema.EntitlementGroupSummary, len(groupRows))
	for i := range groupRows {
		g := &groupRows[i]
		groupsBySlug[g.EntitlementSlug] = append(groupsBySlug[g.EntitlementSlug], &schema.EntitlementGroupSummary{
			ID:   g.ID,
			Name: g.Name,
			Slug: g.Slug,
		})
	}

	result := make([]*schema.Entitlement, 0)

	for _, e := range entitlements {
		entitlement := dbmap.ToEntitlement(&e)
		entitlement.EntitlementGroups = groupsBySlug[e.Slug]
		result = append(result, entitlement)
	}

	return result, nil
}
