package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/telemetry"
)

// lockID elects the replica that runs a pass: the version of the migration
// that brought the lifecycle, by the house convention.
const lockID int64 = 20261008000000

// Overdue moves subscriptions in and out of PAST_DUE as their invoices become
// overdue or are settled.
type Overdue struct {
	uof    *uow.UnitOfWork
	outbox *outbox.ScopedRepository
	grace  time.Duration
}

// NewOverdue re-evaluates PAST_DUE with the auto-collection grace.
func NewOverdue(uof *uow.UnitOfWork, grace time.Duration) *Overdue {
	return &Overdue{uof: uof, outbox: outbox.NewScopedRepository(uof), grace: grace}
}

// Pass re-evaluates up to limit subscriptions whose overdue status may have
// to move, each in its own transaction, recorded under system:kaiten. One
// that fails is logged and left for the next pass.
func (o *Overdue) Pass(ctx context.Context, limit int) (moved int, err error) {
	q := db.New(o.uof.DBTX(ctx))
	now, err := Now(ctx, q)
	if err != nil {
		return 0, err
	}
	candidates, err := q.ListOverdueCandidates(ctx, db.ListOverdueCandidatesParams{
		Now: timestamp(now), AutoCollectionBefore: timestamp(now.Add(-o.grace)),
		PageSize: int32(limit), //nolint:gosec // bounded by the batch size
	})
	if err != nil {
		return 0, err
	}
	for _, candidate := range candidates {
		changed, err := o.one(ctx, candidate.ID, candidate.OrganizationID)
		if err != nil {
			slog.ErrorContext(ctx, "overdue re-evaluation failed", "instance_billing_id", candidate.ID, "error", err)
			telemetry.ItemFailed(ctx, telemetry.JobLifecycle, strings.HasPrefix(err.Error(), "panic "))
			continue
		}
		if changed {
			moved++
		}
	}
	return moved, nil
}

func (o *Overdue) one(ctx context.Context, id, organizationID uuid.UUID) (changed bool, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panic re-evaluating subscription %s: %v", id, r)
		}
	}()
	err = o.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(o.uof.DBTX(ctx))
		if ok, err := LockInstanceOf(ctx, q, id, true); err != nil || !ok {
			return err
		}
		sub, err := q.LockDueSubscription(ctx, id)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		actor, err := SystemActor(ctx, q, organizationID)
		if err != nil {
			return err
		}
		now, err := Now(ctx, q)
		if err != nil {
			return err
		}
		updated, err := Reevaluate(ctx, q, o.outbox, sub, actor, now, o.grace)
		changed = updated.Status != sub.Status
		return err
	})
	return changed, err
}

// Daily is work the job does on its first pass of each UTC day (payment
// methods expiring).
type Daily interface {
	Pass(ctx context.Context) (int, error)
}

// Pass is one bounded step of a pass.
type Pass interface {
	Pass(ctx context.Context, limit int) (int, error)
}

// PassFunc is a function as a Pass.
type PassFunc func(ctx context.Context, limit int) (int, error)

// Pass implements Pass.
func (f PassFunc) Pass(ctx context.Context, limit int) (int, error) { return f(ctx, limit) }

// Steps are the steps of a pass after (a), the overdue re-evaluation (§16.2).
// A nil step is not run.
type Steps struct {
	// Expiry is (b): vouchers and redemptions past their dates.
	Expiry Pass
	// Incompletes is (d): the INCOMPLETE checkouts never paid in their 23 h.
	Incompletes Pass
	// Reminders is (e): trial_will_end for the trials whose reminder is due.
	Reminders Pass
	// Abandoned is (f): the anonymous checkouts still OPEN at their expiry.
	Abandoned Pass
	// Purged is (h): the checkout sessions closed past their retention.
	Purged Pass
	// EveryDay is (c): the first pass of each UTC day.
	EveryDay []Daily
}

// NewJob is the billing-lifecycle job. overdue nil skips (a): with billing
// off, a pass runs (h) alone (§16.1 rule 6).
func NewJob(pool *pgxpool.Pool, overdue *Overdue, cfg sweep.Config, batchSize int, steps Steps) *sweep.Job {
	return sweep.NewPoolPass("billing-lifecycle", pool, lockID, cfg, func(ctx context.Context) error {
		var err error
		if overdue != nil {
			moved, overdueErr := overdue.Pass(ctx, batchSize)
			if moved > 0 {
				slog.InfoContext(ctx, "subscriptions moved in or out of PAST_DUE", "moved", moved)
			}
			err = overdueErr
		}
		for _, step := range []struct {
			pass Pass
			done string
		}{
			{steps.Incompletes, "incomplete checkouts expired"},
			{steps.Reminders, "trial reminders announced"},
			{steps.Abandoned, "anonymous checkouts completed or abandoned at their expiry"},
			{steps.Expiry, "vouchers and redemptions expired"},
			{steps.Purged, "closed checkout sessions deleted"},
		} {
			if step.pass == nil {
				continue
			}
			n, stepErr := step.pass.Pass(ctx, batchSize)
			if n > 0 {
				slog.InfoContext(ctx, step.done, "count", n)
			}
			err = errors.Join(err, stepErr)
		}
		for _, work := range steps.EveryDay {
			n, dailyErr := work.Pass(ctx)
			if n > 0 {
				slog.InfoContext(ctx, "payment methods announced as expiring", "count", n)
			}
			err = errors.Join(err, dailyErr)
		}
		return err
	})
}
