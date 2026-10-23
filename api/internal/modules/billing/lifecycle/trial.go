package lifecycle

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/subscriptions"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/telemetry"
)

// TrialWillEndAt is when a trial ending at trialEndsAt announces its end: the
// family's lead before it (V32-07). It may fall before the trial's start
// when the trial is shorter than the lead.
func TrialWillEndAt(trialEndsAt time.Time, reminderDays int32) time.Time {
	return trialEndsAt.Add(-time.Duration(reminderDays) * 24 * time.Hour)
}

// AnnounceTrialWillEnd emits com.kaiten.instance.billing.v1.trial_will_end
// for a TRIAL whose reminder is due, once: the marker is set in the
// transaction ctx carries, and a trial already announced, or no longer in
// TRIAL, emits nothing (§9.2 rule 7). Whether it emitted.
func AnnounceTrialWillEnd(ctx context.Context, q *db.Queries, repo *outbox.ScopedRepository, catalogue ports.CatalogueSource,
	row db.InstanceBilling, now time.Time,
) (bool, error) {
	marked, err := q.MarkTrialReminderSent(ctx, db.MarkTrialReminderSentParams{Now: invoices.Timestamp(now), ID: row.ID})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	billing, err := subscriptions.Build(ctx, q, catalogue, marked)
	if err != nil {
		return false, err
	}
	return true, repo.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
		marked.OrganizationID, events.InstanceBillingTrialWillEnd.Name, events.InstanceBillingTrialWillEnd.Type, *billing, nil))
}

// TrialReminders is billing-lifecycle step (e): trial_will_end for every
// trial whose trial_will_end_at has passed.
type TrialReminders struct {
	uof       *uow.UnitOfWork
	outbox    *outbox.ScopedRepository
	catalogue ports.CatalogueSource
}

func NewTrialReminders(uof *uow.UnitOfWork, catalogue ports.CatalogueSource) *TrialReminders {
	return &TrialReminders{uof: uof, outbox: outbox.NewScopedRepository(uof), catalogue: catalogue}
}

// Pass announces up to limit due reminders, each in its own transaction: one
// that fails is logged and left for the next pass.
func (r *TrialReminders) Pass(ctx context.Context, limit int) (announced int, err error) {
	q := db.New(r.uof.DBTX(ctx))
	now, err := Now(ctx, q)
	if err != nil {
		return 0, err
	}
	due, err := q.ListDueTrialReminders(ctx, db.ListDueTrialRemindersParams{
		Now: timestamp(now), PageSize: int32(limit), //nolint:gosec // bounded by the batch size
	})
	if err != nil {
		return 0, err
	}
	for _, row := range due {
		sent := false
		err := r.uof.Transact(ctx, func(ctx context.Context) error {
			var err error
			sent, err = AnnounceTrialWillEnd(ctx, db.New(r.uof.DBTX(ctx)), r.outbox, r.catalogue, row, now)
			return err
		})
		if err != nil {
			slog.ErrorContext(ctx, "trial reminder failed", "instance_billing_id", row.ID, "error", err)
			telemetry.ItemFailed(ctx, telemetry.JobLifecycle, strings.HasPrefix(err.Error(), "panic "))
			continue
		}
		if sent {
			announced++
		}
	}
	return announced, nil
}
