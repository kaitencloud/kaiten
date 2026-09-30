package deletefeatureflag

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/events"
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
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		deleteFeatureFlag, err := h.repo.DeleteFeatureFlag(ctx, slug, u.OrganizationID)
		if err != nil {
			return err
		}

		event := outbox.NewOutboxMessage(
			u.OrganizationID,
			events.FeatureFlagDeleted.Name,
			events.FeatureFlagDeleted.Type,
			deleteFeatureFlag,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return err
	}

	h.deps.UsageReporter.DecrementAsync(u.OrganizationID, dogfooding.FeatureFlagEntitlementSlug)

	return nil
}
