package getlicense

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
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

func (h *UseCase) Execute(ctx context.Context, slug string) (*schema.License, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	license, err := h.repository.GetLicense(ctx, slug, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	return license, nil
}
