package getentitlement

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

func (h *UseCase) Execute(ctx context.Context, slug string) (*schema.Entitlement, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	entitlement, err := h.repository.GetEntitlement(ctx, slug, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	return entitlement, nil
}
