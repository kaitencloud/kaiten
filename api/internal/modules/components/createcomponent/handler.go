package createcomponent

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	componentevents "github.com/kaitencloud/kaiten/api/internal/modules/components/events"
	componentschema "github.com/kaitencloud/kaiten/api/internal/modules/components/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const slugValidationRequirements = "must match ^[a-z0-9][a-z0-9-]*[a-z0-9]$ and be 2–100 characters"

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	UserProvider  currentuser.Provider
	UsageReporter services.UsageReporter
	Uof           *uow.UnitOfWork
}

type UseCase struct {
	deps       Deps
	repository *CommandRepository
	outbox     *outbox.ScopedRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewCommandRepository(deps.Uof),
		outbox:     outbox.NewScopedRepository(deps.Uof),
	}
}

func resolveComponentSlug(slug *string, name string, version string) (string, error) {
	if slug != nil {
		if !slugutil.Validate(*slug) {
			return "", kaitenerrors.Validation(
				"CreateComponent.InvalidSlug",
				fmt.Sprintf("Slug %q is invalid: %s", *slug, slugValidationRequirements),
			)
		}
		return *slug, nil
	}

	resolvedSlug, err := slugutil.GenerateUnique(fmt.Sprintf("%s-%s", name, version))
	if err != nil {
		return "", fmt.Errorf("failed to generate slug: %w", err)
	}

	return resolvedSlug, nil
}

// Execute validates the component's caller-supplied slug (if any), enforces
// the creation entitlement, and persists the component, as one flow:
// dogfooding.EnforceAndPersist skips persistence entirely if the
// organization is over its limit, and compensates with a Decrement call if
// persistence -- including its slug-conflict retries -- fails after usage
// was already incremented.
func (h *UseCase) Execute(ctx context.Context, command *Command) (*componentschema.Component, error) {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	if command.PreviousComponentID != nil {
		if _, err := h.repository.GetComponentByID(ctx, *command.PreviousComponentID, u.OrganizationID); err != nil {
			return nil, err
		}
	}

	if command.Slug != nil {
		if _, err := resolveComponentSlug(command.Slug, command.Name, command.Version); err != nil {
			return nil, err
		}
	}

	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, u.OrganizationID, dogfooding.ComponentEntitlementSlug,
		"CreateComponent.EntitlementLimitReached", "Component creation limit reached for this organization", nil,
		func(ctx context.Context) (*componentschema.Component, error) {
			attempt := func(slug string) (*componentschema.Component, error) {
				return h.persistComponent(ctx, u.OrganizationID, u.ID, command, slug)
			}

			if command.Slug != nil {
				return attempt(*command.Slug)
			}

			// No caller-supplied slug: derive one from name+version, retrying
			// with a freshly generated slug whenever the database detects a
			// conflict on it -- slugutil.GenerateUnique's random suffix
			// makes a collision unlikely but not impossible.
			return slugutil.Retry(
				slugutil.DefaultMaxAttempts,
				func() (string, error) { return resolveComponentSlug(nil, command.Name, command.Version) },
				attempt,
			)
		})
}

func (h *UseCase) persistComponent(ctx context.Context, orgID, userID uuid.UUID, command *Command, resolvedSlug string) (*componentschema.Component, error) {
	var component *componentschema.Component

	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		createdComponent, err := h.repository.CreateComponent(
			ctx,
			command.Name,
			command.Version,
			resolvedSlug,
			command.Description,
			command.PreviousComponentID,
			orgID,
			userID,
		)
		if err != nil {
			return err
		}
		component = createdComponent

		event := outbox.NewOutboxMessage(
			orgID,
			componentevents.ComponentCreated.Name,
			componentevents.ComponentCreated.Type,
			component,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return nil, err
	}

	return component, nil
}
