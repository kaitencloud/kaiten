// Package tokenretention deletes credential rows that stopped working long ago.
//
// It exists because nothing else in Kaiten removes a token row, and a process
// using the SDK's auto-refreshing token source mints one every time it refreshes:
// roughly 24 rows per day per process and organization at a 1-hour lifetime, 120
// at 15 minutes. That is unbounded growth in a table on the authentication path.
//
// It runs on a schedule inside the API process, the same way
// internal/infrastructure/retention bounds outbox_events and inbox_events, and for
// the same reason: the mechanism ships with the code that writes the rows, so
// there is no separate CronJob or runbook step to forget. It shares that job's
// scheduler and cross-replica election through internal/infrastructure/sweep and
// keeps what is its own -- the window, and what "retired" means for a credential.
//
// It lives in the identity module rather than in retention because `token` is
// identity's table and "retired" is identity's rule: revoked, or past its own
// expiry. The identity module already owns background work of its own (see the
// pgnotify listener in identity_module.go), which is the pattern this follows.
//
// The window is a retention decision, not a technical one -- a retired row is the
// audit evidence that a credential existed and when it stopped working -- so it is
// configured (KAITEN_RETENTION_RETIRED_TOKENS) and a non-positive value turns the
// sweep off entirely.
package tokenretention

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/modules/identity/infrastructure/db"
)

const (
	// defaultBatchSize matches the transport sweeps'. One bounded DELETE per
	// statement keeps lock hold time and WAL predictable.
	defaultBatchSize = int32(1000)

	// maxBatches caps one pass. A backlog that has been accumulating since before
	// this job existed is drained over successive passes rather than in one run
	// that monopolises the table every replica authenticates against.
	maxBatches = 100

	// sweepLockKey only has to be unique among this database's advisory locks. It
	// is the version of the migration that made this table grow without bound,
	// which is unique by construction and says where to look.
	sweepLockKey = int64(20260818000000)

	sweepName = "token-retention"
)

// Config is the window plus the schedule. Window <= 0 disables the sweep.
type Config struct {
	InitialDelay time.Duration
	Interval     time.Duration
	BatchSize    int32

	// Window is how long a retired credential's row is kept after it stopped
	// working. There is deliberately no "keep forever" special case: that is what
	// a disabled sweep is.
	Window time.Duration
}

// Job deletes retired credentials on a schedule and participates in process
// shutdown.
type Job struct {
	cfg   Config
	sweep *sweep.Job
}

// New builds a Job without starting it. It returns nil when the window is not
// positive, so a disabled sweep is an absent job rather than a started one that
// does nothing -- and the caller's nil check is the same one it already makes for
// a missing pool.
func New(pool *pgxpool.Pool, cfg Config) *Job {
	if cfg.Window <= 0 {
		return nil
	}
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

// Start launches the sweep. Nil-safe, so a caller does not branch on whether the
// window enabled it.
func (j *Job) Start(ctx context.Context) {
	if j == nil {
		return
	}
	j.sweep.Start(ctx)
}

// Stop cancels the scheduler and waits for it to exit. Nil-safe for the same
// reason as Start.
func (j *Job) Stop() {
	if j == nil {
		return
	}
	j.sweep.Stop()
}

// Sweep runs one deterministic pass, election included, and reports how many rows
// it deleted. Exported so a test can drive a pass without waiting out an interval.
func (j *Job) Sweep(ctx context.Context) error {
	if j == nil {
		return nil
	}
	return j.sweep.Sweep(ctx)
}

// pass drains up to maxBatches batches on the connection that holds the lock.
func (j *Job) pass(ctx context.Context, conn *pgxpool.Conn) error {
	cutoff := time.Now().UTC().Add(-j.cfg.Window)
	queries := db.New(conn)

	var total int64
	for range maxBatches {
		if ctx.Err() != nil {
			break
		}

		deleted, err := queries.PurgeRetiredTokens(ctx, db.PurgeRetiredTokensParams{
			RetiredBefore: pgtype.Timestamp{Time: cutoff, InfinityModifier: pgtype.Finite, Valid: true},
			BatchSize:     j.cfg.BatchSize,
		})
		if err != nil {
			return fmt.Errorf("purge retired tokens: %w", err)
		}

		total += deleted
		if deleted < int64(j.cfg.BatchSize) {
			break
		}
	}

	if total > 0 {
		slog.InfoContext(ctx, "token retention sweep purged rows",
			"rows", total, "cutoff", cutoff, "window", j.cfg.Window)
	}

	return nil
}
