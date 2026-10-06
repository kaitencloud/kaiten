package reactivatesubscription

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "ReactivateSubscription"

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute reverts a cancellation scheduled for the period's end, before it.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string) (*subscriptions.InstanceBilling, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var result *subscriptions.InstanceBilling
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		sub, err := lifecycle.Lock(ctx, q, user.OrganizationID, instanceSlug, operation)
		if err != nil {
			return err
		}
		if sub.Status == db.InstanceBillingStatusCANCELED {
			return kaitenerrors.Conflict(operation+".Canceled", "the subscription is canceled: subscribe it again")
		}
		if !sub.CancelAtPeriodEnd {
			return kaitenerrors.Conflict(operation+".NotScheduledForCancellation", "no cancellation is scheduled")
		}
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		if err := lifecycle.BoundaryPending(operation, sub, now); err != nil {
			return err
		}
		updated, err := q.RevertCancellation(ctx, db.RevertCancellationParams{UserID: user.ID, Now: invoices.Timestamp(now), ID: sub.ID})
		if err != nil {
			return err
		}
		result, err = subscriptions.Build(ctx, q, u.deps.Catalogue, updated)
		if err != nil {
			return err
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			user.OrganizationID, events.InstanceBillingCancellationReverted.Name, events.InstanceBillingCancellationReverted.Type,
			subscriptions.CancellationChange{InstanceBilling: *result, EffectiveAt: sub.CurrentPeriodEnd.Time.UTC()}, nil))
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
