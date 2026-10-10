package updatelicense

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familydefault"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyevents"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
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
		repo:     NewCommandRepository(deps.Uof).WithClearedDefaults(familydefault.Announce(outboxRepository)),
		outbox:   outboxRepository,
		families: familyevents.NewRecorder(deps.Uof, outboxRepository),
	}
}

func (h *UseCase) Execute(ctx context.Context, command *Command, slug string) error {
	if days := command.TrialPeriodDays; days != nil && *days != 0 {
		if err := schema.ValidateTrialPeriodDays("UpdateLicense", *days); err != nil {
			return err
		}
	}
	if url := command.SelfServeCtaURL; url != nil && *url != "" {
		if err := schema.ValidateSelfServeCtaURL("UpdateLicense", *url); err != nil {
			return err
		}
	}

	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		updatedLicense, family, err := h.repo.update(ctx, command, slug, user.ID, user.OrganizationID)
		if err != nil {
			return err
		}

		event := outbox.NewOutboxMessage(
			user.OrganizationID,
			events.LicenseUpdated.Name,
			events.LicenseUpdated.Type,
			updatedLicense,
			nil,
		)
		if err := h.outbox.CreateOutboxEvent(ctx, event); err != nil {
			return err
		}

		// Taking the family's default, or giving it up, changes the version the
		// family serves; a rename or a restated default does not.
		return h.families.Moved(ctx, user.OrganizationID, family)
	})
	if err != nil {
		return err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.LicenseUpdatedEntitlementSlug)

	return nil
}
