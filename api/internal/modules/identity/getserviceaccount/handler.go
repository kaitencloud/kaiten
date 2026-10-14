package getserviceaccount

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
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
		repository: NewQueryRepository(deps.Queries),
	}
}

func (h *UseCase) Execute(ctx context.Context, saSlug string) (*schema.ServiceAccount, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	sa, err := h.repository.GetServiceAccount(ctx, saSlug, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	return sa, nil
}
