package updatecomponent

import (
	"context"
	"fmt"

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

func resolveUpdatedSlug(currentSlug string, providedSlug *string, name string, version string, autoVersion bool) (string, error) {
	if providedSlug != nil {
		if !slugutil.Validate(*providedSlug) {
			return "", kaitenerrors.Validation(
				"UpdateComponent.InvalidSlug",
				fmt.Sprintf("Slug %q is invalid: %s", *providedSlug, slugValidationRequirements),
			)
		}
		return *providedSlug, nil
	}

	if !autoVersion {
		return currentSlug, nil
	}

	resolvedSlug, err := slugutil.GenerateUnique(fmt.Sprintf("%s-%s", name, version))
	if err != nil {
		return "", fmt.Errorf("failed to generate slug: %w", err)
	}

	return resolvedSlug, nil
}

func (h *UseCase) Execute(ctx context.Context, slug string, command *Command) (*componentschema.Component, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	var component *componentschema.Component

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		current, err := h.repo.GetComponentBySlug(ctx, slug, user.OrganizationID)
		if err != nil {
			return err
		}

		linkCount, err := h.repo.CountReleaseLinksByComponentID(ctx, current.ID, user.OrganizationID)
		if err != nil {
			return err
		}

		autoVersion := linkCount > 0
		if autoVersion && current.Name == command.Name && current.Version == command.Version {
			return kaitenerrors.Validation(
				"UpdateComponent.LinkedComponentRequiresNewVersion",
				fmt.Sprintf("Component %q is linked to releases and requires a new version when updated", current.Slug),
			)
		}

		resolvedSlug, err := resolveUpdatedSlug(current.Slug, command.Slug, command.Name, command.Version, autoVersion)
		if err != nil {
			return err
		}

		description := command.Description
		if description == nil {
			description = current.Description
		}

		if autoVersion {
			component, err = h.repo.CreateComponent(
				ctx,
				command.Name,
				command.Version,
				resolvedSlug,
				description,
				&current.ID,
				user.OrganizationID,
				user.ID,
			)
		} else {
			component, err = h.repo.UpdateComponent(
				ctx,
				current.ID,
				command.Name,
				command.Version,
				resolvedSlug,
				description,
				user.OrganizationID,
			)
		}
		if err != nil {
			return err
		}
		if component.CreatedBy.Name == "" {
			component.CreatedBy.Name = current.CreatedBy.Name
		}

		event := outbox.NewOutboxMessage(
			user.OrganizationID,
			componentevents.ComponentUpdated.Name,
			componentevents.ComponentUpdated.Type,
			component,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return nil, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.ComponentUpdatedEntitlementSlug)

	return component, nil
}
