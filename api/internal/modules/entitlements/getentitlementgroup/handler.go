package getentitlementgroup

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider currentuser.Provider
	Queries      *db.Queries
}

// UseCase handles getting a single entitlement group.
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

// Execute executes the get entitlement group use case.
func (h *UseCase) Execute(ctx context.Context, slug string) (*schema.EntitlementGroup, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	group, err := h.repository.GetEntitlementGroup(ctx, slug, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	return group, nil
}
