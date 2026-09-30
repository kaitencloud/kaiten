package deletelicense

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyevents"
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
	deps     Deps
	repo     *CommandRepository
	outbox   *outbox.ScopedRepository
	families *familyevents.Recorder
}

func NewUseCase(deps Deps) *UseCase {
	outboxRepository := outbox.NewScopedRepository(deps.Uof)
	return &UseCase{
		deps:     deps,
		repo:     NewCommandRepository(deps.Uof),
		outbox:   outboxRepository,
		families: familyevents.NewRecorder(deps.Uof, outboxRepository),
	}
}

// Execute deletes the version slugged slug, and its family when it was the
// last version. Only the latter gives a license back to the organization's
// quota: createlicense meters families, not versions.
//
// The version's LICENSE_DELETED is followed by its family's event:
// LICENSE_FAMILY_DELETED when the family went with it, LICENSE_FAMILY_UPDATED
// when the family stays but no longer serves the version it served.
func (h *UseCase) Execute(ctx context.Context, slug string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	familyDeleted := false
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		deletedLicense, family, err := h.repo.deleteVersion(ctx, user.OrganizationID, slug)
		if err != nil {
			return err
		}
		familyDeleted = family.deleted

		event := outbox.NewOutboxMessage(
			user.OrganizationID,
			events.LicenseDeleted.Name,
			events.LicenseDeleted.Type,
			deletedLicense,
			nil,
		)
		if err := h.outbox.CreateOutboxEvent(ctx, event); err != nil {
			return err
		}

		if family.deleted {
			return h.families.Deleted(ctx, user.OrganizationID, family.view)
		}
		return h.families.Moved(ctx, user.OrganizationID, family.before)
	})
	if err != nil {
		return err
	}

	if familyDeleted {
		h.deps.UsageReporter.DecrementAsync(user.OrganizationID, dogfooding.LicenseEntitlementSlug)
	}

	return nil
}
