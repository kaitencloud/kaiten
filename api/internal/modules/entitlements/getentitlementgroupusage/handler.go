package getentitlementgroupusage

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Queries      *db.Queries
}

// UseCase handles getting aggregated usage for an entitlement group.
type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

// NewUseCase creates a new UseCase with all dependencies wired.
func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries, deps.AIPolicy),
	}
}

// Execute executes the get entitlement group usage use case.
func (h *UseCase) Execute(ctx context.Context, groupSlug string, instanceSlug string) ([]*schema.EntitlementGroupUsage, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	ctx = h.deps.AIPolicy.Resolve(ctx, user.OrganizationID)

	items, err := h.repository.GetEntitlementGroupUsage(ctx, groupSlug, instanceSlug, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	return items, nil
}
