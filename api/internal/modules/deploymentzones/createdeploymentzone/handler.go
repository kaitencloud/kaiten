package createdeploymentzone

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeployment"
	deploymentZoneEvents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/schema"
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
	Queries              *db.Queries
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

// Execute validates the deployment zone's metadata and caller-supplied slug
// (if any), enforces the creation entitlement, and persists the zone, as
// one flow: dogfooding.EnforceAndPersist skips persistence entirely if the
// organization is over its limit, and compensates with a Decrement call if
// persistence -- including its slug-conflict retries -- fails after usage
// was already incremented.
func (h *UseCase) Execute(ctx context.Context, command *Command) (*schema.DeploymentZone, error) {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	// Validate metadata against the org's declared schema for DEPLOYMENT_ZONE.
	// DZ is strict (additionalProperties: false) so unknown keys are rejected.
	// See module README in metadatafields/ for the convention.
	resolvedMetadata, err := validator.ValidateMetadataForResource(
		ctx, h.deps.MetadataFieldsLister, u.OrganizationID,
		metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
		true,                  // strict: deployment zones are admin-writable
		command.Metadata, nil, // create → no prior metadata
	)
	if err != nil {
		return nil, err
	}
	command.Metadata = resolvedMetadata

	if command.Slug != nil {
		if _, err := slugutil.New(*command.Slug); err != nil {
			return nil, kaitenerrors.Validation("CreateDeploymentZone.InvalidSlug", slugutil.InvalidReason(*command.Slug))
		}
	}

	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, u.OrganizationID, dogfooding.DeploymentZoneEntitlementSlug,
		"CreateDeploymentZone.EntitlementLimitReached", "Deployment zone creation limit reached for this organization", nil,
		func(ctx context.Context) (*schema.DeploymentZone, error) {
			attempt := func(slug string) (*schema.DeploymentZone, error) {
				return h.persistDeploymentZone(ctx, u.OrganizationID, u.ID, command, slug)
			}

			if command.Slug != nil {
				return attempt(*command.Slug)
			}

			// No caller-supplied slug: derive one from the name, retrying with
			// a freshly generated slug whenever the database detects a
			// conflict on it -- slugutil.GenerateUnique's random suffix
			// makes a collision unlikely but not impossible.
			return slugutil.Retry(
				slugutil.DefaultMaxAttempts,
				func() (string, error) { return slugutil.GenerateUnique(command.Name) },
				attempt,
			)
		})
}

func (h *UseCase) persistDeploymentZone(ctx context.Context, orgID, userID uuid.UUID, command *Command, slug string) (*schema.DeploymentZone, error) {
	command.Slug = &slug

	var deploymentZone *schema.DeploymentZone

	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		createdDeploymentZone, err := h.repo.CreateDeploymentZone(ctx, command.Name, slug, command.Type, command.Metadata, command.Description, command.ReleaseID, orgID, userID)
		if err != nil {
			return err
		}

		if command.ReleaseID != nil {
			service := createdeployment.NewService(createdeployment.Deps{UserProvider: h.deps.UserProvider, Uof: h.deps.Uof})
			createdDeployment, err := service.CreateDeployment(ctx, createdDeploymentZone.ID, *command.ReleaseID)
			if err != nil {
				return err
			}

			createdDeploymentZone.ReleaseID = &createdDeployment.ReleaseID
		}

		deploymentZone = createdDeploymentZone

		event := outbox.NewOutboxMessage(
			orgID,
			deploymentZoneEvents.DeploymentZoneCreated.Name,
			deploymentZoneEvents.DeploymentZoneCreated.Type,
			createdDeploymentZone,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return nil, err
	}

	return deploymentZone, nil
}
