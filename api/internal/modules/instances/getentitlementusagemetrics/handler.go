package getentitlementusagemetrics

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. OutboxRepository is injected rather than built from
// Queries here, since it binds to the cross-cutting outbox module's own
// generated db package, not this module's.
type Deps struct {
	UserProvider     currentuser.Provider
	Queries          *db.Queries
	UsageReporter    services.UsageReporter
	OutboxRepository outbox.Repository
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
	outboxRepo outbox.Repository
}

// InstanceEntitlementValueGet is the outbox payload for ENTITLEMENT_VALUE_GET, the read
// audit event this handler emits on every entitlement-usage lookup.
type InstanceEntitlementValueGet struct {
	EntitlementID   uuid.UUID               `json:"entitlement_id" doc:"Unique identifier for the entitlement"`
	InstanceID      uuid.UUID               `json:"instance_id" doc:"Unique identifier for the instance the value was read for"`
	LicenseID       uuid.UUID               `json:"license_id" doc:"Unique identifier for the license carrying the entitlement"`
	OrganizationID  uuid.UUID               `json:"organization_id" doc:"Unique identifier for the owning organization"`
	Type            string                  `json:"type" doc:"Discriminator of the resolved entitlement value" example:"number"`
	Value           schema.EntitlementValue `json:"value" doc:"Resolved entitlement value at read time"`
	Timestamp       time.Time               `json:"timestamp" doc:"When the value was read"`
	EntitlementSlug string                  `json:"entitlement_slug" doc:"URL-friendly identifier of the entitlement"`
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries),
		outboxRepo: deps.OutboxRepository,
	}
}

func (h *UseCase) Execute(ctx context.Context, instanceSlug string, entitlementSlug string) (*schema.EntitlementUsage, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.EntitlementValuesCheckedEntitlementSlug)

	entitlement, err := h.repository.GetEntitlementUsageMetrics(ctx, instanceSlug, entitlementSlug, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	instance, err := h.deps.Queries.GetOneInstance(ctx, db.GetOneInstanceParams{
		OrganizationID: user.OrganizationID,
		Slug:           instanceSlug,
	})
	if err != nil {
		return nil, err
	}

	payloadData := InstanceEntitlementValueGet{
		EntitlementID:   entitlement.EntitlementID,
		InstanceID:      instance.ID,
		LicenseID:       entitlement.LicenseID,
		OrganizationID:  user.OrganizationID,
		Type:            entitlement.Value.TypeString(),
		Value:           entitlement.Value,
		Timestamp:       time.Now().UTC(),
		EntitlementSlug: entitlement.EntitlementSlug,
	}

	event := outbox.NewOutboxMessage(
		user.OrganizationID,
		events.EntitlementValueGet.Name,
		events.EntitlementValueGet.Type,
		payloadData,
		outbox.AuditHeaders{InstanceID: &instance.ID},
	)
	if err := h.outboxRepo.CreateOutboxEvent(ctx, event); err != nil {
		return nil, err
	}

	return entitlement, nil
}
