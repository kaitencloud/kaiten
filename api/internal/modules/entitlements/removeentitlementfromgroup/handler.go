package removeentitlementfromgroup

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
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

// UseCase handles removing an entitlement from a group.
type UseCase struct {
	deps       Deps
	repository *CommandRepository
}

// NewUseCase creates a new UseCase with all dependencies wired.
func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewCommandRepository(deps.Queries),
	}
}

// Execute executes the remove entitlement from group use case.
func (h *UseCase) Execute(ctx context.Context, groupSlug string, entitlementSlug string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}
	ctx = h.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	if !h.deps.AIPolicy.Enabled(ctx) {
		target, err := h.deps.Queries.GetEntitlement(ctx, db.GetEntitlementParams{OrganizationID: user.OrganizationID, Slug: entitlementSlug})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err := h.deps.AIPolicy.RequireType(ctx, string(target.Type)); err != nil {
			return err
		}
	}

	if err := h.repository.RemoveEntitlementFromGroup(ctx, groupSlug, entitlementSlug, user.OrganizationID); err != nil {
		return err
	}

	// Changing a group's membership changes the group, not the entitlement,
	// so it counts as an entitlement-group update -- the group itself is
	// still there, hence no decrement.

	return nil
}
