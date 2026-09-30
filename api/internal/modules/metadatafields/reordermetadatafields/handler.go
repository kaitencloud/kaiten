package reordermetadatafields

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

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

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:   deps,
		repo:   NewCommandRepository(deps.Uof),
		outbox: outbox.NewScopedRepository(deps.Uof),
	}
}

// MetadataFieldReordered is the outbox payload for METADATA_FIELD_REORDERED. It
// carries the field ids in their new display order, not the fields
// themselves — the reorder writes nothing else.
type MetadataFieldReordered struct {
	IDs []uuid.UUID `json:"ids" doc:"Metadata field ids in their new display order"`
}

// Execute reorders the listed metadata fields. The N updates run in a single
// transaction so the reorder is all-or-nothing — partial failures (e.g. a
// foreign id slipped in) revert the entire batch.
func (h *UseCase) Execute(ctx context.Context, command *ReorderMetadataFieldsInput) error {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}

	// Reject duplicate ids early so the DB doesn't quietly accept conflicting
	// display_order assignments. Cheap O(n) check, well worth the safety.
	seen := make(map[string]struct{}, len(command.IDs))
	for _, id := range command.IDs {
		if _, dup := seen[id.String()]; dup {
			return kaitenerrors.UnprocessableEntity(
				"ReorderMetadataFields.DuplicateID",
				fmt.Sprintf("metadata field %s appears multiple times in the reorder payload", id),
			)
		}
		seen[id.String()] = struct{}{}
	}

	var resourceType db.MetadataFieldResourceType
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		rt, err := h.repo.ReorderMetadataFields(ctx, command.IDs, u.OrganizationID, u.ID)
		if err != nil {
			return err
		}
		resourceType = rt

		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			u.OrganizationID,
			events.MetadataFieldReordered.Name,
			events.MetadataFieldReordered.Type,
			MetadataFieldReordered{IDs: command.IDs},
			nil,
		))
	})
	if err != nil {
		return err
	}
	// Reorder doesn't change the schema shape (display_order isn't part of
	// the compiled schema), but it keeps the cache entry's view of
	// "what's active" consistent with the DB. Cheap to drop, safer than
	// skipping. Local + cross-replica NOTIFY, same as every other write here.
	validator.InvalidateAndPublish(ctx, h.deps.Uof.DBTX(ctx), u.OrganizationID, resourceType)

	h.deps.UsageReporter.TrackAsync(u.OrganizationID, dogfooding.MetadataFieldUpdatedEntitlementSlug)

	return nil
}
