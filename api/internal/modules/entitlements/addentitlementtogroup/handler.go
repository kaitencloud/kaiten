package addentitlementtogroup

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/licenseview"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
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
	if err := licenseview.RequireOperational(ctx, h.deps.Uof.DBTX(ctx), h.deps.AIPolicy, user.OrganizationID, command.EntitlementSlug); err != nil {
		return err
	}

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		if err := licenseview.RequireOperationalLocked(ctx, h.deps.Uof.DBTX(ctx), h.deps.AIPolicy, user.OrganizationID, command.EntitlementSlug); err != nil {
			return err
		}
		_, err := h.repo.AddEntitlementToGroup(ctx, groupSlug, command.EntitlementSlug, user.OrganizationID)
		return err
	})
	if err != nil {
		return err
	}

	// Changing a group's membership changes the group, not the entitlement,
	// so it counts as an entitlement-group update.

	return nil
}
