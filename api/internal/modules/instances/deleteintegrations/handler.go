package deleteintegrations

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	instanceintegrations "github.com/kaitencloud/kaiten/api/internal/modules/instances/integrations"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider currentuser.Provider
	Queries      *db.Queries
}

type UseCase struct {
	deps         Deps
	integrations *instanceintegrations.Store
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:         deps,
		integrations: instanceintegrations.NewStore(deps.Queries),
	}
}

func (h *UseCase) Execute(ctx context.Context, instanceSlug, integrationName string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	return h.integrations.Delete(ctx, user.OrganizationID, instanceSlug, integrationName)
}
