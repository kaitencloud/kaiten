package subscribeinstance

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
)

// cancelFree cancels a free live subscription a checkout replaces (§9.10
// rule 6, V31-68), in the subscribe's transaction: at once, with no invoice
// -- nothing to seal, no FINAL, since nothing can bill -- and no fallback
// move, the instance keeping its licence until the new subscription's
// switch. A plan change it had scheduled is dropped. It answers the CANCELED
// row, which the subscribe then subscribes again.
func (u *UseCase) cancelFree(ctx context.Context, q *db.Queries, sub db.InstanceBilling, userID uuid.UUID) (db.InstanceBilling, error) {
	now, err := lifecycle.Now(ctx, q)
	if err != nil {
		return db.InstanceBilling{}, err
	}
	canceled, err := q.CancelSubscription(ctx, db.CancelSubscriptionParams{
		CanceledAt: invoices.Timestamp(now), Reason: nil, UserID: userID, Now: invoices.Timestamp(now), ID: sub.ID,
	})
	if err != nil {
		return db.InstanceBilling{}, err
	}
	if err := lifecycle.AnnouncePlanChangeDropped(ctx, u.outbox, sub); err != nil {
		return db.InstanceBilling{}, err
	}
	if err := lifecycle.AnnounceCanceled(ctx, q, u.outbox, u.deps.Catalogue, canceled, modeImmediate, nil); err != nil {
		return db.InstanceBilling{}, err
	}
	return canceled, nil
}

// modeImmediate is the mode a replaced free subscription is announced
// canceled with (cancelsubscription.ModeImmediate).
const modeImmediate = "IMMEDIATE"

// Replaceable reports whether a public checkout may subscribe the instance:
// it has no live subscription, or a free one the checkout would replace
// (§14.4 rule 2, V31-68). It reads; the subscribe decides again under its
// locks.
func (u *UseCase) Replaceable(ctx context.Context, instanceSlug string) (bool, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return false, err
	}
	q := u.deps.Queries(ctx)
	instance, err := q.GetInstanceBySlug(ctx, db.GetInstanceBySlugParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	sub, err := q.GetInstanceBilling(ctx, db.GetInstanceBillingParams{OrganizationID: user.OrganizationID, InstanceID: &instance.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		return true, nil
	}
	if err != nil {
		return false, err
	}
	if !subscriptions.Live(sub.Status) {
		return true, nil
	}
	return q.IsFreeSubscription(ctx, db.IsFreeSubscriptionParams{
		OrganizationID: user.OrganizationID, LicenseID: instance.LicenseID, InstanceID: instance.ID,
	})
}
