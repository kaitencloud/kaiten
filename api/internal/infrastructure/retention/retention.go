// Package retention bounds the append-only outbox and inbox transport tables.
//
// Scheduling, the startup delay and the cross-replica election live in
// internal/infrastructure/sweep, which internal/modules/identity/tokenretention
// shares. What is here is what is specific to these two tables: their windows and
// the bounded DELETE batches that limit lock hold time and WAL.
package retention

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/retention/db"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
)

const (
	// DefaultInterval and DefaultInitialDelay are sweep's, re-exported because
	// config and the chart's values both document them by name.
	DefaultInterval     = sweep.DefaultInterval
	DefaultInitialDelay = sweep.DefaultInitialDelay

	defaultBatchSize = int32(1000)

	// maxBatchesPerTarget caps one target's work in a pass. A large first
	// backlog is retired over successive passes instead of monopolizing the
	// database in one run.
	maxBatchesPerTarget = 100
	// sweepLockKey only has to be unique among this database's advisory locks.
	sweepLockKey = int64(20260817010000)
	// sweepName labels this job's log lines.
	sweepName = "transport-retention"
)

// Config controls scheduling and the two fixed transport windows. A window of
// zero or less disables that table's cleanup.
type Config struct {
	InitialDelay time.Duration
	Interval     time.Duration
	BatchSize    int32

	OutboxEventsWindow time.Duration
	InboxEventsWindow  time.Duration
}

// Job runs bounded retention sweeps and participates in process shutdown. The
// schedule, the election and the shutdown handshake are sweep.Job's; this type
// owns the two windows and the batching.
type Job struct {
	cfg   Config
	sweep *sweep.Job
}

// New builds a Job without starting it.
func New(pool *pgxpool.Pool, cfg Config) *Job {
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = defaultBatchSize
	}

	job := &Job{cfg: cfg}
	job.sweep = sweep.New(sweepName, pool, sweepLockKey, sweep.Config{
		InitialDelay: cfg.InitialDelay,
		Interval:     cfg.Interval,
	}, job.pass)

	return job
}

// Start launches the sweep. Idempotent; Stop cancels and waits for it, including
// an in-flight pass.
func (j *Job) Start(ctx context.Context) { j.sweep.Start(ctx) }

// Stop cancels the scheduler and waits for it to exit.
func (j *Job) Stop() { j.sweep.Stop() }

// Sweep runs one deterministic pass, election included. Losing the election is a
// successful no-op.
func (j *Job) Sweep(ctx context.Context) error { return j.sweep.Sweep(ctx) }

// pass is the work sweep.Job runs once it holds the lock. Both tables are
// finished on the one connection that holds it.
func (j *Job) pass(ctx context.Context, conn *pgxpool.Conn) error {
	return j.purgeTransportTables(ctx, db.New(conn), time.Now().UTC())
}

func (j *Job) purgeTransportTables(ctx context.Context, queries *db.Queries, now time.Time) error {
	targets := []struct {
		table  string
		window time.Duration
		purge  purgeFunc
	}{
		{"outbox_events", j.cfg.OutboxEventsWindow, func(ctx context.Context, cutoff pgtype.Timestamptz, batchSize int32) (int64, error) {
			return queries.PurgeOutboxEvents(ctx, db.PurgeOutboxEventsParams{Cutoff: cutoff, BatchSize: batchSize})
		}},
		{"inbox_events", j.cfg.InboxEventsWindow, func(ctx context.Context, cutoff pgtype.Timestamptz, batchSize int32) (int64, error) {
			return queries.PurgeInboxEvents(ctx, db.PurgeInboxEventsParams{Cutoff: cutoff, BatchSize: batchSize})
		}},
	}

	for _, target := range targets {
		if target.window <= 0 {
			continue
		}
		cutoff := now.Add(-target.window)
		deleted, err := j.drain(ctx, target.purge, cutoff)
		if err != nil {
			return fmt.Errorf("purge %s: %w", target.table, err)
		}
		if deleted > 0 {
			slog.InfoContext(ctx, "retention sweep purged rows", "table", target.table, "rows", deleted, "cutoff", cutoff)
		}
	}
	return nil
}

type purgeFunc func(ctx context.Context, cutoff pgtype.Timestamptz, batchSize int32) (int64, error)

func (j *Job) drain(ctx context.Context, purge purgeFunc, cutoff time.Time) (int64, error) {
	var total int64
	for range maxBatchesPerTarget {
		if ctx.Err() != nil {
			return total, nil
		}

		deleted, err := purge(ctx, pgtype.Timestamptz{Time: cutoff, Valid: true}, j.cfg.BatchSize)
		if err != nil {
			return total, err
		}
		total += deleted
		if deleted < int64(j.cfg.BatchSize) {
			break
		}
	}
	return total, nil
}
