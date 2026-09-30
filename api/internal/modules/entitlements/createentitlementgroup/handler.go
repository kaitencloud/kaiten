package createentitlementgroup

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	entitlementEvents "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	UsageReporter services.UsageReporter
	Uof           *uow.UnitOfWork
}

// UseCase handles the creation of an entitlement group.
type UseCase struct {
	deps   Deps
	repo   *CommandRepository
	outbox *outbox.ScopedRepository
}

// NewUseCase creates a new UseCase with all dependencies wired.
func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:   deps,
		repo:   NewCommandRepository(deps.Uof),
		outbox: outbox.NewScopedRepository(deps.Uof),
	}
}

// Execute executes the create entitlement group use case, enforcing the
// organization's entitlement-group creation entitlement the same way every
// other create* handler enforces its own (see dogfooding.EnforceAndPersist).
func (h *UseCase) Execute(ctx context.Context, command *Command) (*schema.EntitlementGroup, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	attempt := func(slug string) (*schema.EntitlementGroup, error) {
		var group *schema.EntitlementGroup

		err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
			createdGroup, err := h.repo.CreateEntitlementGroup(ctx, CreateEntitlementGroupInput{
				Name:        command.Name,
				Slug:        slug,
				Description: command.Description,
			}, user.OrganizationID)
			if err != nil {
				return err
			}

			group = createdGroup

			event := outbox.NewOutboxMessage(
				user.OrganizationID,
				entitlementEvents.EntitlementGroupCreated.Name,
				entitlementEvents.EntitlementGroupCreated.Type,
				createdGroup,
				nil,
			)

			return h.outbox.CreateOutboxEvent(ctx, event)
		})
		if err != nil {
			return nil, err
		}

		return group, nil
	}

	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, user.OrganizationID, dogfooding.EntitlementGroupEntitlementSlug,
		"CreateEntitlementGroup.EntitlementGroupLimitReached", "Entitlement group creation limit reached for this organization", nil,
		func(_ context.Context) (*schema.EntitlementGroup, error) {
			if command.Slug != nil {
				slug, err := slugutil.New(*command.Slug)
				if err != nil {
					return nil, kaitenerrors.Validation("CreateEntitlementGroup.InvalidSlug", slugutil.InvalidReason(*command.Slug))
				}
				return attempt(slug.String())
			}

			// No caller-supplied slug: derive one from the name. GenerateUnique's
			// random suffix makes a database-level collision astronomically
			// unlikely but, per its own doc comment, not impossible -- so a rare
			// conflict is retried with a freshly generated slug rather than
			// surfaced as a hard failure for something outside the caller's
			// control.
			return slugutil.Retry(
				slugutil.DefaultMaxAttempts,
				func() (string, error) { return slugutil.GenerateUnique(command.Name) },
				attempt,
			)
		})
}
