package getentitlementgroup

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Repository defines the interface for getting an entitlement group.
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

// GetEntitlementGroup returns a single entitlement group by slug.
func (r *QueryRepository) GetEntitlementGroup(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.EntitlementGroup, error) {
	params := db.GetEntitlementGroupParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	group, err := r.repository.GetEntitlementGroup(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("GetEntitlementGroup.NotFound", fmt.Sprintf("Entitlement group with slug %q not found", slug))
		}
		return nil, err
	}

	return dbmap.ToEntitlementGroup(&group), nil
}
