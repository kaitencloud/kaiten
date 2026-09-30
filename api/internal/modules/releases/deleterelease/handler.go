package deleterelease

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	releaseEvents "github.com/kaitencloud/kaiten/api/internal/modules/releases/events"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	Uof           *uow.UnitOfWork
	UsageReporter services.UsageReporter
}

type UseCase struct {
	deps   Deps
	repo   *CommandRepository
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:   deps,
		repo:   NewCommandRepository(deps.Uof),
		outbox: outbox.NewScopedRepository(deps.Uof),
	}
}

func (h *UseCase) Execute(ctx context.Context, slug string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		// Get the release first to include components in the event
		release, err := h.repo.GetReleaseBySlug(ctx, user.OrganizationID, slug)
		if err != nil {
			return err
		}

		// Get the components before deletion for the event payload
		components, err := h.repo.GetComponentsByReleaseID(ctx, release.ID, user.OrganizationID)
		if err != nil {
			return err
		}
		release.Components = components

		// Remove all component-release links for this release
		err = h.repo.RemoveAllComponentsFromRelease(ctx, release.ID, user.OrganizationID)
		if err != nil {
			return err
		}

		// Delete the release
		_, err = h.repo.DeleteRelease(ctx, user.OrganizationID, slug)
		if err != nil {
			return err
		}

		event := outbox.NewOutboxMessage(
			user.OrganizationID,
			releaseEvents.ReleaseDeleted.Name,
			releaseEvents.ReleaseDeleted.Type,
			release,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return err
	}

	h.deps.UsageReporter.DecrementAsync(user.OrganizationID, dogfooding.ReleaseEntitlementSlug)

	return nil
}
