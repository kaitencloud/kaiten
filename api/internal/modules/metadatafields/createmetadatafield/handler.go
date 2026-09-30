package createmetadatafield

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

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

// Execute creates a MetadataField after validating the supplied json_schema
// is itself a valid JSON Schema 2020-12 document. The (org, resource_type,
// key) uniqueness is enforced by the DB partial unique index — a duplicate
// is reported back as a 409 by the repository.
func (h *UseCase) Execute(ctx context.Context, command *CreateMetadataFieldInput) (*schema.MetadataField, error) {
	u, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	schemaBytes, err := json.Marshal(command.JSONSchema)
	if err != nil {
		return nil, fmt.Errorf("createmetadatafield: marshalling json_schema: %w", err)
	}

	if err := validator.ValidateSchemaShape(schemaBytes); err != nil {
		return nil, err
	}

	// A metadata field is a resource the organization provisions, so its
	// creation is enforced and billed like every other create* handler's.
	return dogfooding.EnforceAndPersist(ctx, h.deps.UsageReporter, u.OrganizationID, dogfooding.MetadataFieldEntitlementSlug,
		"CreateMetadataField.MetadataFieldLimitReached", "Metadata field creation limit reached for this organization", nil,
		func(ctx context.Context) (*schema.MetadataField, error) {
			return h.persist(ctx, command, schemaBytes, u.OrganizationID, u.ID)
		})
}

func (h *UseCase) persist(
	ctx context.Context,
	command *CreateMetadataFieldInput,
	schemaBytes []byte,
	organizationID, userID uuid.UUID,
) (*schema.MetadataField, error) {
	var created *schema.MetadataField
	err := h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		field, err := h.repo.CreateMetadataField(ctx, command, schemaBytes, organizationID, userID)
		if err != nil {
			return err
		}
		created = field

		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			organizationID,
			events.MetadataFieldCreated.Name,
			events.MetadataFieldCreated.Type,
			field,
			nil,
		))
	})
	if err != nil {
		return nil, err
	}
	// Drop the cached compiled schema for this (org, resource_type) — locally
	// and, via NOTIFY, on every other replica — so the next metadata write
	// reflects the new field. See validator/cache.go.
	validator.InvalidateAndPublish(ctx, h.deps.Uof.DBTX(ctx), organizationID, command.ResourceType)
	return created, nil
}
