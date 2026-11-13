package getentitlementsusagemetrics

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	entitlementUsageSchema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	AIPolicy      aiusage.Policy
	UserProvider  currentuser.Provider
	Queries       *db.Queries
	UsageReporter services.UsageReporter
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries, deps.AIPolicy),
	}
}

func (h *UseCase) Execute(ctx context.Context, instanceSlug string) ([]entitlementUsageSchema.EntitlementUsage, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	ctx = h.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	return h.ExecuteWithinOperation(ctx, instanceSlug)
}

// ExecuteWithinOperation composes a parent operation using its already-resolved
// platform decision. It performs no provider evaluation while a transaction is held.
func (h *UseCase) ExecuteWithinOperation(ctx context.Context, instanceSlug string) ([]entitlementUsageSchema.EntitlementUsage, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	ctx = h.deps.AIPolicy.ForOrganization(ctx, user.OrganizationID)

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.EntitlementValuesCheckedEntitlementSlug)

	entitlements, err := h.repository.GetEntitlementsUsageMetrics(ctx, instanceSlug, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	return entitlements, nil
}
