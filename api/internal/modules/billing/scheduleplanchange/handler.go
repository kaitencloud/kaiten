package scheduleplanchange

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "SchedulePlanChange"

type UseCase struct {
	deps   access.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute schedules a move to another FLAT_FEE price, of any PUBLISHED
// version, for the next boundary: that period's RENEWAL bills the old plan's
// arrears and the new plan's advance, and moves the instance to the new
// version. Scheduling the same target again changes nothing.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, priceID uuid.UUID) (*subscriptions.InstanceBilling, error) {
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
		switch {
		case sub.Status == db.InstanceBillingStatusTRIAL:
			return kaitenerrors.Conflict(operation+".TrialInProgress", "a trial cannot change plan: cancel it and subscribe with the new price")
		case !subscriptions.Live(sub.Status):
			return kaitenerrors.Conflict(operation+".NotActive", "the subscription is canceled")
		case sub.CancelAtPeriodEnd:
			return kaitenerrors.Conflict(operation+".CancellationScheduled", "the subscription is set to cancel at the period's end")
		}
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		if err := lifecycle.BoundaryPending(operation, sub, now); err != nil {
			return err
		}
		target, err := u.deps.Catalogue.Price(ctx, user.OrganizationID, priceID)
		if err != nil {
			return err
		}
		switch {
		case target == nil:
			return kaitenerrors.NotFoundf(operation+".PriceNotFound", "price %s not found", priceID)
		case target.BillingModel != prices.ModelFlatFee:
			return kaitenerrors.UnprocessableEntity(operation+".PriceNotFlatFee", "a subscription's base is a FLAT_FEE price")
		case target.Status != prices.StatusActive:
			return kaitenerrors.UnprocessableEntity(operation+".PriceDeprecated", "a deprecated price is no longer offered")
		case target.LicenseState != string(db.LicenseLifecycleStatePUBLISHED):
			return kaitenerrors.UnprocessableEntity(operation+".LicenseNotPublished", "the price's licence version is not PUBLISHED")
		case target.ID == sub.BaseLicensePriceID:
			return kaitenerrors.UnprocessableEntity(operation+".SamePrice", "the subscription is already on this price")
		case target.Currency != sub.Currency:
			return kaitenerrors.UnprocessableEntity(operation+".CurrencyMismatch",
				"the boundary's invoice bills the old plan and the new one in one currency: "+sub.Currency)
		}
		if sub.ScheduledLicensePriceID != nil && *sub.ScheduledLicensePriceID == target.ID {
			result, err = subscriptions.Build(ctx, q, u.deps.Catalogue, sub)
			return err
		}
		updated, err := q.SetScheduledChange(ctx, db.SetScheduledChangeParams{
			PriceID: &target.ID, ScheduledAt: invoices.Timestamp(now), UserID: user.ID, Now: invoices.Timestamp(now), ID: sub.ID,
		})
		if err != nil {
			return err
		}
		result, err = subscriptions.Build(ctx, q, u.deps.Catalogue, updated)
		if err != nil {
			return err
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
			user.OrganizationID, events.InstanceBillingPlanChangeScheduled.Name, events.InstanceBillingPlanChangeScheduled.Type,
			subscriptions.PlanChangeSchedule{
				InstanceSlug: sub.InstanceSlug, FromPriceID: sub.BaseLicensePriceID,
				ToPriceID: target.ID, EffectiveAt: sub.CurrentPeriodEnd.Time.UTC(),
			}, nil))
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
