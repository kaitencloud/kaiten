package getrelease

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/components/releaselink"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. ComponentLink is the components module's own public
// port (see releaselink) -- this module never imports components' generated
// db package directly.
type Deps struct {
	UserProvider  currentuser.Provider
	Queries       *db.Queries
	ComponentLink releaselink.Port
	UsageReporter services.UsageReporter
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries, deps.ComponentLink),
	}
}

func (h *UseCase) Execute(ctx context.Context, slug string) (*schema.Release, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	release, err := h.repository.GetReleaseBySlug(ctx, slug, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.ReleaseReadEntitlementSlug)

	return release, nil
}
