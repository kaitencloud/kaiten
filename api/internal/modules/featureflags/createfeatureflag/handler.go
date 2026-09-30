package createfeatureflag

import (
	"context"

	"github.com/google/uuid"

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
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. EntitlementCatalogue is the entitlements module's
// own public read port -- this module never imports entitlements'
// generated db package directly.
type Deps struct {
	UserProvider         currentuser.Provider
	UsageReporter        services.UsageReporter
	Uof                  *uow.UnitOfWork
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

// Execute validates the flag's caller-supplied slug (if any) and its
// configuration against the organization's entitlements, enforces the
// creation entitlement, and persists the flag, as one flow:
// dogfooding.EnforceAndPersist skips persistence entirely if the
// organization is over its limit, and compensates with a Decrement call if
// persistence -- including its slug-conflict retries -- fails after usage
// was already incremented.
func (h *UseCase) Execute(ctx context.Context, flag *schema.FeatureFlag) (*schema.FeatureFlag, error) {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	userProvidedSlug := flag.Slug != ""
	if userProvidedSlug {
		if _, err := slugutil.New(flag.Slug); err != nil {
			return nil, kaitenerrors.Validation("CreateFeatureFlag.InvalidSlug", slugutil.InvalidReason(flag.Slug))
		}
	}

	// ValidateFlagInOrganization only inspects the flag's own fields (type,
	// variants, targeting, metadata) and the organization's declared
	// entitlements -- never flag.Slug -- so it only needs to run once,
	// regardless of how many slug attempts the retry loop below takes.
	flagValidator := validator.NewValidator()
	if err := flagValidator.ValidateFlagInOrganization(flag, common.EntitlementSlugs(ctx, h.deps.EntitlementCatalogue, u.OrganizationID)); err != nil {
		return nil, kaitenerrors.FromValidationError(err)
	}

	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, u.OrganizationID, dogfooding.FeatureFlagEntitlementSlug,
		"CreateFeatureFlag.EntitlementLimitReached", "Feature flag creation limit reached for this organization", nil,
		func(ctx context.Context) (*schema.FeatureFlag, error) {
			attempt := func(slug string) (*schema.FeatureFlag, error) {
				flag.Slug = slug
				return h.persistFeatureFlag(ctx, u.OrganizationID, flag)
			}

			if userProvidedSlug {
				return attempt(flag.Slug)
			}

			// No caller-supplied slug: derive one from the name, retrying
			// with a freshly generated slug whenever the database detects a
			// conflict on it -- slugutil.GenerateUnique's random
			// suffix makes a collision unlikely but not impossible.
			return slugutil.Retry(
				slugutil.DefaultMaxAttempts,
				func() (string, error) { return slugutil.GenerateUnique(flag.Name) },
				attempt,
			)
		})
}

func (h *UseCase) persistFeatureFlag(ctx context.Context, orgID uuid.UUID, flag *schema.FeatureFlag) (*schema.FeatureFlag, error) {
	var featureFlag *schema.FeatureFlag

	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		createdFeatureFlag, err := h.repo.CreateFeatureFlag(ctx, flag, orgID)
		if err != nil {
			return err
		}

		featureFlag = createdFeatureFlag

		event := outbox.NewOutboxMessage(
			orgID,
			events.FeatureFlagCreated.Name,
			events.FeatureFlagCreated.Type,
			createdFeatureFlag,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return nil, err
	}

	return featureFlag, nil
}
