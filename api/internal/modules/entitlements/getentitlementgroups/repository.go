package getentitlementgroups

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// Repository defines the interface for listing entitlement groups.
// QueryRepository implements Repository using sqlc queries.
type QueryRepository struct {
	repository *db.Queries
}

// NewQueryRepository creates a new QueryRepository.
func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

// GetEntitlementGroups returns a cursor-paginated page of entitlement groups
// for an organization.
func (r *QueryRepository) GetEntitlementGroups(ctx context.Context, organizationID uuid.UUID, limitPlusOne int32, cursor *pagination.IDCursor) ([]*schema.EntitlementGroup, error) {
	var cursorID *uuid.UUID
	if cursor != nil {
		cursorID = &cursor.ID
	}

	groups, err := r.repository.GetEntitlementGroups(ctx, db.GetEntitlementGroupsParams{
		OrganizationID: organizationID,
		CursorID:       cursorID,
		LimitPlusOne:   limitPlusOne,
	})
	if err != nil {
		return nil, err
	}

	result := make([]*schema.EntitlementGroup, 0, len(groups))
	for _, g := range groups {
		result = append(result, dbmap.ToEntitlementGroup(&g))
	}

	return result, nil
}
