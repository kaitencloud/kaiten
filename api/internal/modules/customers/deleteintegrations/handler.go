package deleteintegrations

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	customerintegrations "github.com/kaitencloud/kaiten/api/internal/modules/customers/integrations"
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
	integrations *customerintegrations.Store
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:         deps,
		integrations: customerintegrations.NewStore(deps.Queries),
	}
}

func (h *UseCase) Execute(ctx context.Context, customerSlug, integrationName string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	return h.integrations.Delete(ctx, user.OrganizationID, customerSlug, integrationName)
}
