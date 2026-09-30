package updatelicenseentitlement

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	UsageReporter services.UsageReporter
	Uof           *uow.UnitOfWork
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

func (h *UseCase) Execute(ctx context.Context, licenseSlug, entitlementSlug string, command *Command) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		updateLicenseEntitlement, err := h.repo.UpdateLicenseEntitlement(ctx, licenseSlug, entitlementSlug, command, user.ID, user.OrganizationID)
		if err != nil {
			return err
		}

		event := outbox.NewOutboxMessage(
			user.OrganizationID,
			events.LicenseEntitlementUpdated.Name,
			events.LicenseEntitlementUpdated.Type,
			updateLicenseEntitlement,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.LicenseEntitlementUpdatedEntitlementSlug)

	return nil
}
