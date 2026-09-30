package updatemetadatafield

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/metadatafields/schema"
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

// Execute updates a MetadataField. The validation chain is:
//  1. Shape — the new json_schema must itself be a valid JSON Schema 2020-12 doc.
//  2. Transition — compared against the currently stored schema, the change
//     must fit the whitelist of safe transitions (cf. validator.ValidateSchemaTransition).
//
// Both checks happen inside the transaction to guarantee we compare against
// the row we then write to.
func (h *UseCase) Execute(ctx context.Context, command *UpdateMetadataFieldInput) (*schema.MetadataField, error) {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	newSchemaBytes, err := json.Marshal(command.JSONSchema)
	if err != nil {
		return nil, fmt.Errorf("updatemetadatafield: marshalling json_schema: %w", err)
	}
	if err := validator.ValidateSchemaShape(newSchemaBytes); err != nil {
		return nil, err
	}

	var updated *schema.MetadataField
	err = h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		existing, err := h.repo.GetMetadataField(ctx, command.ID, u.OrganizationID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return kaitenerrors.NotFound(
					"UpdateMetadataField.NotFound",
					fmt.Sprintf("metadata field %s not found", command.ID),
				)
			}
			return err
		}

		// Reject mutations on archived rows — the API contract is that
		// archived fields are immutable (cf. UPDATE query's WHERE
		// archived_at IS NULL guard).
		if existing.ArchivedAt.Valid {
			return kaitenerrors.UnprocessableEntity(
				"UpdateMetadataField.Archived",
				fmt.Sprintf("metadata field %s is archived and cannot be modified", command.ID),
			)
		}

		// ResourceType, Key and DisplayOrder are structurally writable on the
		// shared wire schema (create-metadata-field uses the same one), but
		// this endpoint has never accepted them: resourceType/key are
		// immutable after creation and displayOrder belongs
		// exclusively to POST /metadata-fields/reorder. A
		// zero value is treated as "not sent" -- the same convention used
		// elsewhere in this fold -- so only a value that's both
		// present and different from what's stored is rejected.
		if command.ResourceType != "" && command.ResourceType != existing.ResourceType {
			return kaitenerrors.UnprocessableEntity(
				"UpdateMetadataField.ResourceTypeImmutable",
				"resourceType cannot be changed after creation",
			)
		}
		if command.Key != "" && command.Key != existing.Key {
			return kaitenerrors.UnprocessableEntity(
				"UpdateMetadataField.KeyImmutable",
				"key cannot be changed after creation",
			)
		}
		if command.DisplayOrder != 0 && command.DisplayOrder != existing.DisplayOrder {
			return kaitenerrors.UnprocessableEntity(
				"UpdateMetadataField.DisplayOrderNotSettable",
				"displayOrder cannot be set through this endpoint; use POST /metadata-fields/reorder",
			)
		}

		var oldSchema map[string]any
		if err := json.Unmarshal(existing.JsonSchema, &oldSchema); err != nil {
			return fmt.Errorf("updatemetadatafield: unmarshalling stored json_schema: %w", err)
		}
		if err := validator.ValidateSchemaTransition(oldSchema, command.JSONSchema); err != nil {
			return err
		}

		field, err := h.repo.UpdateMetadataField(ctx, command, newSchemaBytes, u.OrganizationID, u.ID)
		if err != nil {
			return err
		}
		updated = field

		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			u.OrganizationID,
			events.MetadataFieldUpdated.Name,
			events.MetadataFieldUpdated.Type,
			field,
			nil,
		))
	})
	if err != nil {
		return nil, err
	}
	// Cache eviction (local + cross-replica NOTIFY) after a successful
	// commit — see validator/cache.go.
	validator.InvalidateAndPublish(ctx, h.deps.Uof.DBTX(ctx), u.OrganizationID, updated.ResourceType)

	h.deps.UsageReporter.TrackAsync(u.OrganizationID, dogfooding.MetadataFieldUpdatedEntitlementSlug)

	return updated, nil
}
