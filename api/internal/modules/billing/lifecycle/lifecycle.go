// Package lifecycle is what the subscription transitions share: finding and
// locking a subscription, the refusals every change shares, and the moves in
// and out of PAST_DUE and to CANCELED.
package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// BoundaryRetryAfter is how long a change refused while a boundary is being
// closed should wait (Appendix A: Retry-After: 60): the close runs every five
// minutes at most, and usually much sooner after the boundary.
const BoundaryRetryAfter = time.Minute

// Lock locks an instance's subscription for a change; operation+".NotFound"
// when the instance is unknown or was never subscribed.
func Lock(ctx context.Context, q *db.Queries, organizationID uuid.UUID, instanceSlug, operation string) (db.InstanceBilling, error) {
	notFound := kaitenerrors.NotFoundf(operation+".NotFound", "instance %q has no subscription", instanceSlug)
	instance, err := q.GetInstanceBySlug(ctx, db.GetInstanceBySlugParams{OrganizationID: organizationID, Slug: instanceSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.InstanceBilling{}, notFound
	}
	if err != nil {
		return db.InstanceBilling{}, err
	}
	sub, err := q.LockInstanceBilling(ctx, db.LockInstanceBillingParams{OrganizationID: organizationID, InstanceID: &instance.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.InstanceBilling{}, notFound
	}
	return sub, err
}

// BoundaryPending refuses a change while the subscription's period has ended
// and its close has not run yet: the change would land before or after the
// boundary depending on how late the close is.
func BoundaryPending(operation string, sub db.InstanceBilling, now time.Time) error {
	if subscriptions.Live(sub.Status) && !sub.CurrentPeriodEnd.Time.After(now) {
		return kaitenerrors.Conflict(operation+".BoundaryPending",
			"the subscription's period has ended and is being closed; retry in a minute").WithRetryAfter(BoundaryRetryAfter)
	}
	return nil
}

// Now is the database's clock.
func Now(ctx context.Context, q *db.Queries) (time.Time, error) {
	clock, err := q.BillingClock(ctx)
	if err != nil {
		return time.Time{}, err
	}
	return clock.Time.UTC(), nil
}

// Reevaluate moves a subscription into PAST_DUE when one of its invoices is
// overdue, and out of it when none is any more: after an invoice changed, and
// on every lifecycle pass. Only an ACTIVE subscription becomes PAST_DUE; a
// TRIAL has no invoice and a CANCELED one stays canceled.
// grace is the auto-collection grace (access.Deps.AutoCollectionGrace).
func Reevaluate(ctx context.Context, q *db.Queries, repo *outbox.ScopedRepository, sub db.InstanceBilling, actor uuid.UUID, now time.Time, grace time.Duration) (db.InstanceBilling, error) {
	if sub.Status != db.InstanceBillingStatusACTIVE && sub.Status != db.InstanceBillingStatusPASTDUE {
		return sub, nil
	}
	since, err := q.EarliestOverdue(ctx, db.EarliestOverdueParams{
		InstanceBillingID: sub.ID, Now: invoices.Timestamp(now), AutoCollectionBefore: invoices.Timestamp(now.Add(-grace)),
	})
	if err != nil {
		return sub, err
	}
	overdue := since.Valid
	var next db.InstanceBillingStatus
	var reason string
	var pastDueSince pgtype.Timestamp
	switch {
	case overdue && sub.Status == db.InstanceBillingStatusACTIVE:
		next, reason, pastDueSince = db.InstanceBillingStatusPASTDUE, "INVOICE_OVERDUE", since
	case !overdue && sub.Status == db.InstanceBillingStatusPASTDUE:
		next, reason = db.InstanceBillingStatusACTIVE, "SETTLED"
	default:
		return sub, nil
	}
	updated, err := q.SetPastDue(ctx, db.SetPastDueParams{
		Status: next, PastDueSince: pastDueSince, UserID: actor, Now: invoices.Timestamp(now), ID: sub.ID,
	})
	if err != nil {
		return sub, err
	}
	return updated, repo.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
		sub.OrganizationID, events.InstanceBillingStatusChanged.Name, events.InstanceBillingStatusChanged.Type,
		subscriptions.StatusChange{
			InstanceBillingID: sub.ID, InstanceSlug: sub.InstanceSlug,
			From: string(sub.Status), To: string(next), Reason: reason,
		}, nil))
}

// AnnounceCanceled records a subscription's cancellation.
func AnnounceCanceled(ctx context.Context, q *db.Queries, repo *outbox.ScopedRepository, catalogue ports.CatalogueSource,
	row db.InstanceBilling, mode string, finalInvoice *uuid.UUID,
) error {
	billing, err := subscriptions.Build(ctx, q, catalogue, row)
	if err != nil {
		return err
	}
	return repo.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
		row.OrganizationID, events.InstanceBillingCanceled.Name, events.InstanceBillingCanceled.Type,
		subscriptions.Cancellation{InstanceBilling: *billing, Mode: mode, FinalInvoiceID: finalInvoice}, nil))
}

// AnnouncePlanChangeDropped records that a pending plan change was dropped.
func AnnouncePlanChangeDropped(ctx context.Context, repo *outbox.ScopedRepository, before db.InstanceBilling) error {
	if before.ScheduledLicensePriceID == nil {
		return nil
	}
	return repo.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
		before.OrganizationID, events.InstanceBillingPlanChangeCancelled.Name, events.InstanceBillingPlanChangeCancelled.Type,
		subscriptions.PlanChangeSchedule{
			InstanceSlug: before.InstanceSlug, FromPriceID: before.BaseLicensePriceID,
			ToPriceID: *before.ScheduledLicensePriceID, EffectiveAt: before.CurrentPeriodEnd.Time.UTC(),
		}, nil))
}

// SystemActor is system:kaiten's membership in the organization: the user
// work Kaiten does on its own behalf is recorded under.
func SystemActor(ctx context.Context, q *db.Queries, organizationID uuid.UUID) (uuid.UUID, error) {
	actor, err := q.GetSystemActor(ctx, db.GetSystemActorParams{
		OrganizationID: organizationID, ExternalID: platformidentity.ExternalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, fmt.Errorf("system:kaiten has no membership in organization %s", organizationID)
	}
	return actor, err
}

func timestamp(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t.UTC(), InfinityModifier: pgtype.Finite, Valid: true}
}
