package updatelicense

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familydefault"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/familyevents"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
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
		if !h.deps.AIPolicy.Enabled {
			q := db.New(h.deps.Uof.DBTX(ctx))
			current, err := q.GetOneLicense(ctx, db.GetOneLicenseParams{OrganizationID: user.OrganizationID, Slug: slug})
			if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return err
			}
			if err == nil {
				changed := command.IsDefault != current.IsDefault || command.PricingType != "" && string(command.PricingType) != string(current.PricingType)
				changed = changed || command.RequiresPaymentMethod != nil && *command.RequiresPaymentMethod != current.RequiresPaymentMethod
				if command.TrialPeriodDays != nil {
					changed = changed || current.TrialPeriodDays == nil || *command.TrialPeriodDays != *current.TrialPeriodDays
				}
				if command.SelfServeCtaURL != nil {
					changed = changed || current.SelfServeCtaUrl == nil || *command.SelfServeCtaURL != *current.SelfServeCtaUrl
				}
				if changed {
					hasAI, err := q.LicenseFamilyHasAI(ctx, db.LicenseFamilyHasAIParams{OrganizationID: user.OrganizationID, FamilyID: &current.FamilyID, FamilySlug: nil})
					if err != nil {
						return err
					}
					if hasAI {
						return h.deps.AIPolicy.RequireEnabled()
					}
				}
			}
		}
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

	return nil
}
