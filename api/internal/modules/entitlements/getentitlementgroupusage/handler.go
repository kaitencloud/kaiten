package getentitlementgroupusage

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	Queries       *db.Queries
	UsageReporter services.UsageReporter
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
		repository: NewQueryRepository(deps.Queries),
	}
}

// Execute executes the get entitlement group usage use case.
func (h *UseCase) Execute(ctx context.Context, groupSlug string, instanceSlug string) ([]*schema.EntitlementGroupUsage, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	items, err := h.repository.GetEntitlementGroupUsage(ctx, groupSlug, instanceSlug, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.EntitlementGroupReadEntitlementSlug)

	return items, nil
}
