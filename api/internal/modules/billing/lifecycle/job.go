package lifecycle

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
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

// NewJob is the billing-lifecycle job.
// daily is work the job does on its first pass of each UTC day (payment
// methods expiring).
type daily interface {
	Pass(ctx context.Context) (int, error)
}

func NewJob(pool *pgxpool.Pool, overdue *Overdue, cfg sweep.Config, batchSize int, everyDay ...daily) *sweep.Job {
	return sweep.NewPoolPass("billing-lifecycle", pool, lockID, cfg, func(ctx context.Context) error {
		moved, err := overdue.Pass(ctx, batchSize)
		if moved > 0 {
			slog.InfoContext(ctx, "subscriptions moved in or out of PAST_DUE", "moved", moved)
		}
		for _, work := range everyDay {
			n, dailyErr := work.Pass(ctx)
			if n > 0 {
				slog.InfoContext(ctx, "payment methods announced as expiring", "count", n)
			}
			err = errors.Join(err, dailyErr)
		}
		return err
	})
}
