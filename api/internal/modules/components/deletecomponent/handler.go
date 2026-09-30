package deletecomponent

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	componentevents "github.com/kaitencloud/kaiten/api/internal/modules/components/events"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
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
		component, err := h.repo.GetComponentBySlug(ctx, slug, user.OrganizationID)
		if err != nil {
			return err
		}

		linkCount, err := h.repo.CountReleaseLinksByComponentID(ctx, component.ID, user.OrganizationID)
		if err != nil {
			return err
		}
		if linkCount > 0 {
			return kaitenerrors.Conflict(
				"DeleteComponent.LinkedComponentConflict",
				fmt.Sprintf("Component %q is linked to %d release(s) and cannot be deleted", slug, linkCount),
			)
		}

		deletedComponent, err := h.repo.DeleteComponentBySlug(ctx, slug, user.OrganizationID)
		if err != nil {
			return err
		}

		event := outbox.NewOutboxMessage(
			user.OrganizationID,
			componentevents.ComponentDeleted.Name,
			componentevents.ComponentDeleted.Type,
			deletedComponent,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return err
	}

	h.deps.UsageReporter.DecrementAsync(user.OrganizationID, dogfooding.ComponentEntitlementSlug)

	return nil
}
