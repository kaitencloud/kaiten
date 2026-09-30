package createrelease

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	releaseEvents "github.com/kaitencloud/kaiten/api/internal/modules/releases/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/releases/schema"
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
	deps   Deps
	repo   *CommandRepository
	outbox *outbox.ScopedRepository
}

// NewUseCase builds repo and outbox once, bound to deps.Uof rather than a
// fixed DBTX -- see CommandRepository's and outbox.ScopedRepository's doc
// comments. persistRelease below calls them directly inside its Transact
// closure with no per-call construction.
func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:   deps,
		repo:   NewCommandRepository(deps.Uof),
		outbox: outbox.NewScopedRepository(deps.Uof),
	}
}

func resolveReleaseSlug(slug *string, version string) (string, error) {
	if slug != nil {
		if !slugutil.Validate(*slug) {
			return "", kaitenerrors.Validation(
				"CreateRelease.InvalidSlug",
				fmt.Sprintf("Slug %q is invalid: %s", *slug, slugValidationRequirements),
			)
		}
		return *slug, nil
	}

	resolvedSlug, err := slugutil.GenerateUnique(version)
	if err != nil {
		return "", fmt.Errorf("failed to generate slug: %w", err)
	}

	return resolvedSlug, nil
}

func dedupeComponentIDs(componentIDs []uuid.UUID) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(componentIDs))
	result := make([]uuid.UUID, 0, len(componentIDs))

	for _, componentID := range componentIDs {
		if _, ok := seen[componentID]; ok {
			continue
		}
		seen[componentID] = struct{}{}
		result = append(result, componentID)
	}

	return result
}

// Execute validates the release's caller-supplied slug (if any), enforces
// the creation entitlement, and persists the release, as one flow:
// dogfooding.EnforceAndPersist skips persistence entirely if the
// organization is over its limit, and compensates with a Decrement call if
// persistence -- including its slug-conflict retries -- fails after usage
// was already incremented.
func (h *UseCase) Execute(ctx context.Context, command *Command) (*schema.Release, error) {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	command.ComponentIDs = dedupeComponentIDs(command.ComponentIDs)

	if command.Slug != nil {
		if _, err := resolveReleaseSlug(command.Slug, command.Version); err != nil {
			return nil, err
		}
	}

	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, u.OrganizationID, dogfooding.ReleaseEntitlementSlug,
		"CreateRelease.EntitlementLimitReached", "Release creation limit reached for this organization", nil,
		func(ctx context.Context) (*schema.Release, error) {
			attempt := func(slug string) (*schema.Release, error) {
				return h.persistRelease(ctx, u.OrganizationID, u.ID, command, slug)
			}

			if command.Slug != nil {
				return attempt(*command.Slug)
			}

			// No caller-supplied slug: derive one from the version, retrying
			// with a freshly generated slug whenever the database detects a
			// conflict on it -- slugutil.GenerateUnique's random suffix
			// makes a collision unlikely but not impossible.
			return slugutil.Retry(
				slugutil.DefaultMaxAttempts,
				func() (string, error) { return resolveReleaseSlug(nil, command.Version) },
				attempt,
			)
		})
}

func (h *UseCase) persistRelease(ctx context.Context, orgID, userID uuid.UUID, command *Command, slug string) (*schema.Release, error) {
	command.Slug = &slug

	var release *schema.Release

	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		createdRelease, err := h.repo.CreateRelease(ctx, command.Version, slug, command.Description, orgID, userID)
		if err != nil {
			return err
		}

		for _, componentID := range command.ComponentIDs {
			if _, err := h.repo.GetComponentByID(ctx, componentID, orgID); err != nil {
				return err
			}

			if err := h.repo.AddComponentToRelease(ctx, componentID, createdRelease.ID, orgID); err != nil {
				return fmt.Errorf("failed to add component %s to release: %w", componentID, err)
			}
		}

		components, err := h.repo.GetComponentsByReleaseID(ctx, createdRelease.ID, orgID)
		if err != nil {
			return fmt.Errorf("failed to fetch components: %w", err)
		}
		createdRelease.Components = components

		release = createdRelease

		event := outbox.NewOutboxMessage(
			orgID,
			releaseEvents.ReleaseCreated.Name,
			releaseEvents.ReleaseCreated.Type,
			createdRelease,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return nil, err
	}

	return release, nil
}
