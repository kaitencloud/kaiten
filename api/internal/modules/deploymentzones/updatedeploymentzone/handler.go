package updatedeploymentzone

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/createdeployment"
	deploymentZoneEvents "github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/events"
	metadatafieldsdb "github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/patchutil"
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

func (h *UseCase) Execute(ctx context.Context, command *Command, slug string) error {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		// Load the current DZ *inside the transaction* to feed the validator
		// with the pre-update metadata — required by the archived-key
		// tolerance rule (a key matching an archived MetadataField passes only
		// if it was already on the resource). Reading here, rather than before
		// RunInTx, keeps the read-merge-write atomic — mirroring updateinstance
		// and closing the TOCTOU window where a concurrent metadata write could
		// be clobbered by a merge built on a stale snapshot.
		currentDZ, err := h.repo.GetDeploymentZoneBySlug(ctx, slug, u.OrganizationID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return kaitenerrors.NotFound("UpdateDeploymentZone.NotFound", fmt.Sprintf("Deployment zone with slug %q not found", slug))
			}
			return err
		}
		var currentMetadata map[string]any
		if len(currentDZ.Metadata) > 0 {
			if err := json.Unmarshal(currentDZ.Metadata, &currentMetadata); err != nil {
				return fmt.Errorf("updatedeploymentzone: parsing current metadata: %w", err)
			}
		}

		// Validate metadata against the org's declared schema for DEPLOYMENT_ZONE.
		// The validator also resolves the metadata to persist by merging in any
		// archived keys the payload omitted (server-side preservation).
		// See module README in metadatafields/ for the convention.
		resolvedMetadata, err := validator.ValidateMetadataForResource(
			ctx, h.deps.MetadataFieldsLister, u.OrganizationID,
			metadatafieldsdb.MetadataFieldResourceTypeDEPLOYMENTZONE,
			true, // strict: deployment zones are admin-writable
			command.Metadata, currentMetadata,
		)
		if err != nil {
			return err
		}
		command.Metadata = resolvedMetadata

		updatedDeploymentZone, err := h.repo.UpdateDeploymentZone(ctx, command, slug, u.ID, u.OrganizationID)
		if err != nil {
			return err
		}

		// Deployments are an append-only history; the zone's current release
		// is derived from the latest row. Clients echo the current release
		// back in the PUT body, so only record a deployment when the release
		// actually changes: an unchanged or omitted release must leave the
		// history untouched, and re-recording the release already running is
		// not an event. Moving back to a release the zone ran before IS a
		// change and is recorded as its own row.
		currentReleaseID := currentDZ.ReleaseID
		resolvedReleaseID := patchutil.ResolveOptional(currentReleaseID, command.ReleaseID)
		if patchutil.Changed(currentReleaseID, resolvedReleaseID) {
			service := createdeployment.NewService(createdeployment.Deps{UserProvider: h.deps.UserProvider, Uof: h.deps.Uof})
			createdDeployment, err := service.CreateDeployment(ctx, updatedDeploymentZone.ID, resolvedReleaseID)
			if err != nil {
				return err
			}

			updatedDeploymentZone.ReleaseID = &createdDeployment.ReleaseID
		} else if currentReleaseID != uuid.Nil {
			updatedDeploymentZone.ReleaseID = &currentReleaseID
		}

		event := outbox.NewOutboxMessage(
			u.OrganizationID,
			deploymentZoneEvents.DeploymentZoneUpdated.Name,
			deploymentZoneEvents.DeploymentZoneUpdated.Type,
			updatedDeploymentZone,
			nil,
		)

		return h.outbox.CreateOutboxEvent(ctx, event)
	})
	if err != nil {
		return err
	}

	h.deps.UsageReporter.TrackAsync(u.OrganizationID, dogfooding.DeploymentZoneUpdatedEntitlementSlug)

	return nil
}
