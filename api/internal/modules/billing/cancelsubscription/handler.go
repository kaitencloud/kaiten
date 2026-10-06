package cancelsubscription

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/closing"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "CancelSubscription"

// Modes, as the API spells them.
const (
	ModeAtPeriodEnd = "AT_PERIOD_END"
	ModeImmediate   = "IMMEDIATE"
)

// CanceledSubscription is a cancellation's answer: the subscription, and the
// FINAL invoice an immediate cancellation issued.
type CanceledSubscription struct {
	subscriptions.InstanceBilling
	FinalInvoice *invoices.InvoiceSummary `json:"finalInvoice,omitempty" doc:"The FINAL invoice of an immediate cancellation"`
}

type UseCase struct {
	deps   access.Deps
	closer *closing.Closer
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps access.Deps, closer *closing.Closer) *UseCase {
	return &UseCase{deps: deps, closer: closer, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute cancels a subscription. A trial is canceled at once, with no
// invoice. AT_PERIOD_END lets the period paid for run out: the close then
// issues the FINAL invoice and cancels. IMMEDIATE issues the FINAL invoice
// now, arrears up to this instant with flat fees billed in full, and refunds
// nothing. Cancellation touches billing only: entitlements and licence dates
// are the vendor's to change.
func (u *UseCase) Execute(ctx context.Context, instanceSlug, mode string, reason *string) (*CanceledSubscription, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if mode == "" {
		mode = ModeAtPeriodEnd
	}
	if reason != nil && len([]rune(*reason)) > 500 {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidReason", "reason is at most 500 characters")
	}
	q := u.deps.Queries(ctx)
	at, err := lifecycle.Now(ctx, q)
	if err != nil {
		return nil, err
	}
	if mode == ModeImmediate {
		// Every report dated before the cancellation must have committed
		// before it is billed: seal now, outside the transaction.
		instance, err := q.GetInstanceBySlug(ctx, db.GetInstanceBySlugParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
		if err == nil {
			if sub, err := q.GetInstanceBilling(ctx, db.GetInstanceBillingParams{OrganizationID: user.OrganizationID, InstanceID: &instance.ID}); err == nil &&
				sub.Status != db.InstanceBillingStatusTRIAL && subscriptions.Live(sub.Status) {
				if err := u.closer.Seal(ctx, sub, at); err != nil {
					return nil, err
				}
			} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
				return nil, err
			}
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
	}

	var result *CanceledSubscription
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		sub, err := lifecycle.Lock(ctx, q, user.OrganizationID, instanceSlug, operation)
		if err != nil {
			return err
		}
		if !subscriptions.Live(sub.Status) {
			return kaitenerrors.Conflict(operation+".NotActive", "the subscription is already canceled")
		}
		now, err := lifecycle.Now(ctx, q)
		if err != nil {
			return err
		}
		if err := lifecycle.BoundaryPending(operation, sub, now); err != nil {
			return err
		}

		var updated db.InstanceBilling
		var final *db.InstanceInvoice
		switch {
		case sub.Status == db.InstanceBillingStatusTRIAL:
			updated, err = q.CancelSubscription(ctx, db.CancelSubscriptionParams{
				CanceledAt: invoices.Timestamp(now), Reason: reason, UserID: user.ID, Now: invoices.Timestamp(now), ID: sub.ID,
			})
			if err != nil {
				return err
			}
			if err := lifecycle.AnnounceCanceled(ctx, q, u.outbox, u.deps.Catalogue, updated, mode, nil); err != nil {
				return err
			}
		case mode == ModeImmediate:
			final, updated, err = u.closer.Finalize(ctx, q, sub, at, reason, user.ID, now)
			if err != nil {
				return err
			}
			if err := lifecycle.AnnouncePlanChangeDropped(ctx, u.outbox, sub); err != nil {
				return err
			}
			if err := lifecycle.AnnounceCanceled(ctx, q, u.outbox, u.deps.Catalogue, updated, mode, &final.ID); err != nil {
				return err
			}
		case sub.CancelAtPeriodEnd:
			updated = sub
		default:
			updated, err = q.ScheduleCancellation(ctx, db.ScheduleCancellationParams{
				Now: invoices.Timestamp(now), Reason: reason, UserID: user.ID, ID: sub.ID,
			})
			if err != nil {
				return err
			}
			if err := lifecycle.AnnouncePlanChangeDropped(ctx, u.outbox, sub); err != nil {
				return err
			}
			billing, err := subscriptions.Build(ctx, q, u.deps.Catalogue, updated)
			if err != nil {
				return err
			}
			if err := u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
				user.OrganizationID, events.InstanceBillingCancellationScheduled.Name, events.InstanceBillingCancellationScheduled.Type,
				subscriptions.CancellationChange{InstanceBilling: *billing, EffectiveAt: updated.CurrentPeriodEnd.Time.UTC()}, nil)); err != nil {
				return err
			}
		}

		billing, err := subscriptions.Build(ctx, q, u.deps.Catalogue, updated)
		if err != nil {
			return err
		}
		result = &CanceledSubscription{InstanceBilling: *billing, FinalInvoice: nil}
		if final != nil {
			summary := invoices.Summary(*final)
			result.FinalInvoice = &summary
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}
