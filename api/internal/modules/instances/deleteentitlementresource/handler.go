package deleteentitlementresource

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	"github.com/kaitencloud/kaiten/api/internal/platform/currentuser"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// operation prefixes this operation's error codes.
const operation = "DeleteEntitlementResource"

// Deps lists exactly what this handler needs, instead of the full
// services.Container.
type Deps struct {
	AIPolicy     aiusage.Policy
	UserProvider currentuser.Provider
	Uof          *uow.UnitOfWork
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

// Execute forgets one resource's counter, under the pair's lock, and announces
// it. It is idempotent: a resource that holds no counter is already forgotten,
// and nothing is written or announced for it.
//
// It writes no journal row and does not move report_seq: it is not a report, and
// the journal keeps what the resource's reports did.
func (h *UseCase) Execute(ctx context.Context, instanceSlug, entitlementSlug, resourceSegment string) error {
	user, err := h.deps.UserProvider.GetUser(ctx)
	if err != nil {
		return err
	}
	ctx = h.deps.AIPolicy.Resolve(ctx, user.OrganizationID)

	resourceKey := usage.DecodeResourceKey(resourceSegment)
	if !usage.ValidResourceKey(resourceKey) {
		return kaitenerrors.UnprocessableEntityWithErrors(
			operation+".InvalidResourceKey",
			"resourceKey must be 1 to 128 characters of letters, digits, '.', '_', ':' and '-', and neither '.' nor '..'",
			&kaitenerrors.ErrorDetail{Message: "the key's format", Location: "path.resourceKey", Value: resourceKey},
		)
	}

	return h.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		pair, err := h.repo.LockPair(ctx, instanceSlug, entitlementSlug, user.OrganizationID)
		if err != nil {
			return err
		}
		if err := h.deps.AIPolicy.RequireType(ctx, string(pair.EntitlementType)); err != nil {
			return err
		}
		if pair.LimitScope != db.EntitlementLimitScopeRESOURCE {
			return kaitenerrors.UnprocessableEntityf(operation+".NotPerResource",
				"entitlement %q counts per instance: it has no resources", entitlementSlug)
		}

		stored, found, err := h.repo.Delete(ctx, pair, resourceKey, user.OrganizationID)
		if err != nil || !found {
			return err
		}
		counter, err := entitlementvalue.ParseNumberUsageValue(stored)
		if err != nil {
			return err
		}
		now, err := h.repo.Now(ctx)
		if err != nil {
			return err
		}

		return h.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			user.OrganizationID,
			events.InstanceEntitlementResourceDeleted.Name,
			events.InstanceEntitlementResourceDeleted.Type,
			InstanceEntitlementResourceDeleted{
				EntitlementID:   pair.EntitlementID,
				EntitlementSlug: pair.EntitlementSlug,
				InstanceID:      pair.InstanceID,
				ResourceKey:     resourceKey,
				Value:           counter.Value,
				EventCount:      counter.EventCount,
			},
			outbox.AuditHeaders{InstanceID: &pair.InstanceID},
		).At(now))
	})
}
