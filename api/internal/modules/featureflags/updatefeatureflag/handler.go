package updatefeatureflag

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/common"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/featureflags/validator"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. EntitlementCatalogue is the entitlements module's
// own public read port -- this module never imports entitlements'
// generated db package directly.
type Deps struct {
	UserProvider         currentuser.Provider
	Uof                  *uow.UnitOfWork
	UsageReporter        services.UsageReporter
	EntitlementCatalogue catalogue.Port
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

func (h *UseCase) Execute(ctx context.Context, slug string, flag *schema.FeatureFlag) error {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	flagValidator := validator.NewValidator()

	err = flagValidator.ValidateFlagInOrganization(flag, common.EntitlementSlugs(ctx, h.deps.EntitlementCatalogue, u.OrganizationID))
	if err != nil {
		return kaitenerrors.FromValidationError(err)
	}

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		createdFeatureFlag, err := h.repo.UpdateFeatureFlag(ctx, flag, u.ID, slug, u.OrganizationID)
		if err != nil {
			return err
		}

		event := outbox.NewOutboxMessage(
			u.OrganizationID,
			events.FeatureFlagUpdated.Name,
			events.FeatureFlagUpdated.Type,
			createdFeatureFlag,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return err
	}

	h.deps.UsageReporter.TrackAsync(u.OrganizationID, dogfooding.FeatureFlagUpdatedEntitlementSlug)

	return nil
}
