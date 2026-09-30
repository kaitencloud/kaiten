package unarchivemetadatafield

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/validator"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
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

func (h *UseCase) Execute(ctx context.Context, command *Command) (*schema.MetadataField, error) {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	var unarchived *schema.MetadataField
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		field, err := h.repo.UnarchiveMetadataField(ctx, command.ID, u.OrganizationID, u.ID)
		if err != nil {
			return err
		}
		unarchived = field

		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			u.OrganizationID,
			events.MetadataFieldUnarchived.Name,
			events.MetadataFieldUnarchived.Type,
			field,
			nil,
		))
	})
	if err != nil {
		return nil, err
	}
	// Cache eviction (local + cross-replica NOTIFY) after a successful
	// commit — the field re-enters the active schema composition, so the
	// cached compiled schema is now stale everywhere.
	validator.InvalidateAndPublish(ctx, h.deps.Uof.DBTX(ctx), u.OrganizationID, unarchived.ResourceType)

	// The field re-enters the active set, so it counts against the quota
	// again -- the mirror image of archivemetadatafield's decrement.
	h.deps.UsageReporter.TrackAsync(u.OrganizationID, dogfooding.MetadataFieldEntitlementSlug)

	return unarchived, nil
}
