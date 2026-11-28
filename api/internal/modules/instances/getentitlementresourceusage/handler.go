package getentitlementresourceusage

import (
	"context"
	"time"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Deps lists exactly what this handler needs, instead of the full
// services.Container. OutboxRepository is injected rather than built from
// Queries here, since it binds to the cross-cutting outbox module's own
// generated db package, not this module's.
type Deps struct {
	AIPolicy         aiusage.Policy
	UserProvider     currentuser.Provider
	Queries          *db.Queries
	UsageReporter    services.UsageReporter
	OutboxRepository outbox.Repository
}

type UseCase struct {
	deps       Deps
	repository *QueryRepository
}

func NewUseCase(deps Deps) *UseCase {
	return &UseCase{
		deps:       deps,
		repository: NewQueryRepository(deps.Queries, deps.AIPolicy),
	}
}

// Execute reads one resource's usage and announces the read, as the read of an
// entitlement's own usage does: ENTITLEMENT_VALUE_GET, with the resource named.
func (h *UseCase) Execute(ctx context.Context, instanceSlug, entitlementSlug, resourceSegment string) (*schema.EntitlementUsage, error) {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return nil, err
	}
	ctx = h.deps.AIPolicy.Resolve(ctx, user.OrganizationID)

	resourceKey := usage.DecodeResourceKey(resourceSegment)
	if !usage.ValidResourceKey(resourceKey) {
		return nil, apierrors.UnprocessableEntityWithErrors(
			operation+".InvalidResourceKey",
			"resourceKey must be 1 to 128 characters of letters, digits, '.', '_', ':' and '-', and neither '.' nor '..'",
			&apierrors.ErrorDetail{Message: "the key's format", Location: "path.resourceKey", Value: resourceKey},
		)
	}

	entitlement, instanceID, err := h.repository.GetEntitlementResourceUsage(ctx, instanceSlug, entitlementSlug, resourceKey, user.OrganizationID)
	if err != nil {
		return nil, err
	}

	h.deps.UsageReporter.TrackAsync(user.OrganizationID, dogfooding.EntitlementValuesCheckedEntitlementSlug)

	event := outbox.NewOutboxMessage(
		user.OrganizationID,
		events.EntitlementValueGet.Name,
		events.EntitlementValueGet.Type,
		getentitlementusagemetrics.InstanceEntitlementValueGet{
			EntitlementID:   entitlement.EntitlementID,
			InstanceID:      instanceID,
			LicenseID:       entitlement.LicenseID,
			OrganizationID:  user.OrganizationID,
			Type:            entitlement.Value.TypeString(),
			Value:           entitlement.Value,
			Timestamp:       time.Now().UTC(),
			EntitlementSlug: entitlement.EntitlementSlug,
			ResourceKey:     &resourceKey,
		},
		outbox.AuditHeaders{InstanceID: &instanceID},
	)
	if err := h.deps.OutboxRepository.CreateOutboxEvent(ctx, event); err != nil {
		return nil, err
	}

	return entitlement, nil
}
