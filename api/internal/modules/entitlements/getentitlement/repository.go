package getentitlement

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/grouprefs"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type QueryRepository struct {
	policy     aiusage.Policy
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries, policies ...aiusage.Policy) *QueryRepository {
	policy := aiusage.Policy{}
	if len(policies) > 0 {
		policy = policies[0]
	}
	return &QueryRepository{
		policy:     policy,
		repository: repository,
	}
}

func (r *QueryRepository) GetEntitlement(ctx context.Context, slug string, organizationID uuid.UUID) (*schema.Entitlement, error) {
	params := db.GetEntitlementParams{
		Slug:           slug,
		OrganizationID: organizationID,
	}

	entitlement, err := r.repository.GetEntitlement(ctx, params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("GetEntitlement.NotFound", fmt.Sprintf("Entitlement with slug %q not found", slug))
		}
		return nil, err
	}
	if err := r.policy.RequireType(string(entitlement.Type)); err != nil {
		return nil, err
	}
	result := dbmap.ToEntitlement(&entitlement)
	result.EntitlementGroups, err = grouprefs.LoadForEntitlement(ctx, r.repository, slug, organizationID)
	if err != nil {
		return nil, err
	}

	return result, nil
}
