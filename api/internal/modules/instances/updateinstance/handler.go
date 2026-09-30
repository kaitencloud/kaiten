package updateinstance

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/patchutil"
	"github.com/kaitencloud/kaiten/api/internal/shared/slugutil"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. MetadataFieldsLister is metadatafields' own public
// port (see validator.NewLister) -- this module never imports
// metadatafields' generated db package directly.
type Deps struct {
	UserProvider         currentuser.Provider
	Uof                  *uow.UnitOfWork
	UsageReporter        services.UsageReporter
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

func (h *UseCase) Execute(ctx context.Context, command *Command, slug string) (*schema.Instance, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	// The endpoint's pattern tag already rejects a malformed slug, but the
	// format rule lives in slugutil, not in a struct tag: check it here too
	// so every path into this use case -- not just the HTTP one -- gets the
	// same answer, and so the tag can never quietly drift from the rule.
	if command.Slug != nil {
		if _, err := slugutil.New(*command.Slug); err != nil {
			return nil, kaitenerrors.Validation("UpdateInstance.InvalidSlug", slugutil.InvalidReason(*command.Slug))
		}
	}

	var instance *schema.Instance

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		// Get current instance to check previous deployment zone AND to feed
		// the validator with the pre-update metadata, which the archived-key
		// tolerance rule needs.
		currentInstance, err := h.repo.GetInstance(ctx, slug, user.OrganizationID)
		if err != nil {
			return err
		}

		// Validate metadata against the org's declared schema for INSTANCE.
		// INSTANCE is tolerant (additionalProperties: true) — unknown keys flow
		// through unchanged (auto-reported metadata stays forward-compat) but
		// declared keys are still strictly type-checked. The validator also
		// resolves the metadata to persist by merging in archived keys the
		// payload omitted (server-side preservation).
		// See module README in metadatafields/ for the convention.
		resolvedMetadata, err := validator.ValidateMetadataForResource(
			ctx, h.deps.MetadataFieldsLister, user.OrganizationID,
			metadatafieldsdb.MetadataFieldResourceTypeINSTANCE,
			false, // tolerant: instance metadata is auto-reported by the SaaS
			command.Metadata, currentInstance.Metadata,
		)
		if err != nil {
			return err
		}
		command.Metadata = resolvedMetadata

		// The PUT replaces the full resource, but clients (the edit dialog in
		// particular) do not expose the deployment zone and omit it from the
		// body. Treat an absent zone as "keep the current one" — same
		// preservation as the metadata above — so an unrelated edit cannot
		// silently detach the instance from its zone. Clearing the
		// zone through this endpoint is not supported.
		command.DeploymentZoneID = patchutil.ResolveOptionalPointer(currentInstance.DeploymentZoneID, command.DeploymentZoneID)

		previousDeploymentZoneID := currentInstance.DeploymentZoneID

		// Update the instance
		updatedInstance, err := h.repo.UpdateInstance(ctx, command, slug, user.ID, user.OrganizationID)
		if err != nil {
			return err
		}
		instance = updatedInstance

		// Record INSTANCE_UPDATE event
		updateEvent := outbox.NewOutboxMessage(
			user.OrganizationID,
			events.InstanceUpdated.Name,
			events.InstanceUpdated.Type,
			updatedInstance,
			outbox.AuditHeaders{InstanceID: &updatedInstance.ID},
		)

		if err := h.outbox.CreateOutboxEvent(ctx, updateEvent); err != nil {
			return err
		}

		// Check if deployment zone changed
		newDeploymentZoneID := command.DeploymentZoneID

		if newDeploymentZoneID != nil && !patchutil.PointersEqual(previousDeploymentZoneID, newDeploymentZoneID) {
			if previousDeploymentZoneID == nil {
				// No previous deployment zone -> INSTANCE_DEPLOYMENT
				deploymentEvent := outbox.NewOutboxMessage(
					user.OrganizationID,
					events.InstanceDeployed.Name,
					events.InstanceDeployed.Type,
					updatedInstance,
					outbox.AuditHeaders{InstanceID: &updatedInstance.ID},
				)

				if err := h.outbox.CreateOutboxEvent(ctx, deploymentEvent); err != nil {
					return err
				}
			} else {
				// Had previous deployment zone -> INSTANCE_MIGRATION
				migrationEvent := outbox.NewOutboxMessage(
					user.OrganizationID,
					events.InstanceMigrated.Name,
					events.InstanceMigrated.Type,
					updatedInstance,
					outbox.AuditHeaders{InstanceID: &updatedInstance.ID},
				)

				if err := h.outbox.CreateOutboxEvent(ctx, migrationEvent); err != nil {
					return err
				}
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.InstanceUpdatedEntitlementSlug)

	return instance, nil
}
