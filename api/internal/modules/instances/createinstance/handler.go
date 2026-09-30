package createinstance

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. MetadataFieldsLister is metadatafields' own public
// port (see validator.NewLister) -- this module never imports
// metadatafields' generated db package directly.
type Deps struct {
	UserProvider         currentuser.Provider
	UsageReporter        services.UsageReporter
	Uof                  *uow.UnitOfWork
	MetadataFieldsLister validator.MetadataFieldsLister
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

// Execute validates metadata, validates the instance's caller-supplied slug
// (if any), enforces the creation entitlement, and persists the instance,
// as one flow: dogfooding.EnforceAndPersist (via enforceAndPersist) skips
// persistence entirely if the organization is over its limit, and
// compensates with a Decrement call if persistence -- including its
// slug-conflict retries -- fails after usage was already incremented.
// A caller that needs a different error code for the rejection --
// upsertintegration is the one example today -- calls Execute directly and
// recognizes EntitlementLimitReachedCode in the returned error, rather than
// calling EnforceCreationLimit separately first, which would report usage
// twice for one logical creation.
func (h *UseCase) Execute(ctx context.Context, command *Command) (*schema.Instance, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	// Validate metadata against the org's declared schema for INSTANCE.
	// INSTANCE is tolerant (additionalProperties: true). See the module
	// README in metadatafields/ for the convention.
	resolvedMetadata, err := validator.ValidateMetadataForResource(
		ctx, h.deps.MetadataFieldsLister, user.OrganizationID,
		metadatafieldsdb.MetadataFieldResourceTypeINSTANCE,
		false,                 // tolerant: instance metadata is auto-reported by the SaaS
		command.Metadata, nil, // create → no prior metadata
	)
	if err != nil {
		return nil, err
	}
	command.Metadata = resolvedMetadata

	if command.Slug != nil {
		if _, err := slugutil.New(*command.Slug); err != nil {
			return nil, kaitenerrors.Validation("CreateInstance.InvalidSlug", slugutil.InvalidReason(*command.Slug))
		}
	}

	return h.enforceAndPersist(ctx, user.OrganizationID, func(ctx context.Context) (*schema.Instance, error) {
		attempt := func(slug string) (*schema.Instance, error) {
			return h.persistInstance(ctx, user.ID, user.OrganizationID, command, slug)
		}

		if command.Slug != nil {
			return attempt(*command.Slug)
		}

		// No caller-supplied slug: derive one from the name, retrying with a
		// freshly generated slug whenever the database detects a conflict on
		// it -- slugutil.GenerateUnique's random suffix makes a
		// collision unlikely but not impossible.
		return slugutil.Retry(
			slugutil.DefaultMaxAttempts,
			func() (string, error) { return slugutil.GenerateUnique(command.Name) },
			attempt,
		)
	})
}

// enforceAndPersist enforces the creation entitlement and then calls
// persist, delegating the whole enforce/persist/compensate sequence to
// dogfooding.EnforceAndPersist. persist is a parameter (rather than
// always calling h.persistInstance directly) so this compensation wiring
// can be exercised in a unit test with a forced persistence failure,
// without a real transaction.
func (h *UseCase) enforceAndPersist(
	ctx context.Context,
	orgID uuid.UUID,
	persist func(ctx context.Context) (*schema.Instance, error),
) (*schema.Instance, error) {
	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, orgID, dogfooding.InstanceEntitlementSlug,
		EntitlementLimitReachedCode, "Instance creation limit reached for this organization", nil, persist)
}

func (h *UseCase) persistInstance(ctx context.Context, userID, orgID uuid.UUID, command *Command, slug string) (*schema.Instance, error) {
	command.Slug = &slug

	var createdInstance *schema.Instance

	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		instance, err := h.repo.CreateInstance(ctx, command, userID, orgID)
		if err != nil {
			return err
		}

		createdInstance = instance

		// Record INSTANCE_CREATION event
		creationEvent := outbox.NewOutboxMessage(
			orgID,
			events.InstanceCreated.Name,
			events.InstanceCreated.Type,
			createdInstance,
			outbox.AuditHeaders{InstanceID: &createdInstance.ID},
		)

		if err := h.outbox.CreateOutboxEvent(ctx, creationEvent); err != nil {
			return err
		}

		// If instance has a deployment zone, also dispatch INSTANCE_DEPLOYMENT event
		if createdInstance.DeploymentZoneID != nil {
			deploymentEvent := outbox.NewOutboxMessage(
				orgID,
				events.InstanceDeployed.Name,
				events.InstanceDeployed.Type,
				createdInstance,
				outbox.AuditHeaders{InstanceID: &createdInstance.ID},
			)

			if err := h.outbox.CreateOutboxEvent(ctx, deploymentEvent); err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return createdInstance, nil
}

// EntitlementLimitReachedCode is the error code EnforceCreationLimit returns
// on a threshold breach. Exported so a caller composing Execute (which
// enforces the limit internally, exactly once, as part of its own flow --
// see Execute's doc comment) can recognize this specific rejection and
// re-code it for its own API surface without guessing at or duplicating the
// string.
const EntitlementLimitReachedCode = "CreateInstance.EntitlementLimitReached"

// EnforceCreationLimit checks the organization's instance-creation
// entitlement and returns a conflict error on a threshold breach. Exported
// so any entry point that can create an instance -- not just this package's
// own Execute -- shares the identical check.
func (h *UseCase) EnforceCreationLimit(ctx context.Context, orgID uuid.UUID) error {
	_, err := dogfooding.EnforceCreationLimit(ctx, h.deps.UsageReporter, orgID, dogfooding.InstanceEntitlementSlug,
		EntitlementLimitReachedCode, "Instance creation limit reached for this organization", nil)
	return err
}
