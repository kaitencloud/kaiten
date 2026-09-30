package addentitlementtogroup

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	UsageReporter services.UsageReporter
	Uof           *uow.UnitOfWork
}

// UseCase handles adding an entitlement to a group.
type UseCase struct {
	deps Deps
	repo *CommandRepository
}

// NewUseCase creates a new UseCase with all dependencies wired.
func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps: deps,
		repo: NewCommandRepository(deps.Uof),
	}
}

// Execute executes the add entitlement to group use case.
func (h *UseCase) Execute(ctx context.Context, groupSlug string, command *Command) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		_, err := h.repo.AddEntitlementToGroup(ctx, groupSlug, command.EntitlementSlug, user.OrganizationID)
		return err
	})
	if err != nil {
		return err
	}

	// Changing a group's membership changes the group, not the entitlement,
	// so it counts as an entitlement-group update.
	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.EntitlementGroupUpdatedEntitlementSlug)

	return nil
}
