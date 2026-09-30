// Package sweep is the scheduler behind every recurring database maintenance
// pass that runs inside the API process.
//
// PostgreSQL has no built-in scheduler and this project does not provision
// pg_cron for every supported database, so a small in-process ticker is the
// portable mechanism. It exists as a package rather than as a helper inside one
// job because there is now more than one thing to sweep, owned by different parts
// of the codebase: internal/infrastructure/retention bounds the outbox and inbox
// transport tables, and internal/modules/identity/tokenretention bounds the token
// table. Each owner keeps its own SQL and its own semantics -- what "expired"
// means for a transport row is not what "retired" means for a credential -- and
// shares the parts that are genuinely identical: the interval, the startup delay,
// the shutdown handshake, and the cross-replica election.
//
// A session advisory lock elects one replica per pass. Every replica runs the
// ticker, and all but one skip the work after a single lock probe, so the cost of
// running this on every pod is one round trip per interval per pod.
package sweep

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	// DefaultInterval runs a pass twice a day. Retention windows here are measured
	// in days, which does not justify hourly database churn.
	DefaultInterval = 12 * time.Hour
	// DefaultInitialDelay keeps maintenance off the startup critical path while
	// still guaranteeing a first attempt in pods that restart within an interval.
	DefaultInitialDelay = 5 * time.Minute

	// unlockTimeout bounds the release. It runs on a context detached from the
	// job's, because the most likely reason a pass is unwinding is that the
	// context was cancelled -- and an unreleased session lock would keep every
	// replica skipping until the connection dies.
	unlockTimeout = 5 * time.Second
)

// Config is the schedule. Both fields default; a non-positive Interval disables
// the job, which is how a deployment turns one off without a second flag.
type Config struct {
	InitialDelay time.Duration
	Interval     time.Duration
}

// Pass is one unit of work, called with the connection that holds the advisory
// lock.
//
// It gets that connection rather than the pool on purpose: the lock is
// session-scoped, so work issued on a second connection would run outside the
// elected session, and two replicas could then delete at once while each believed
// it had lost. *pgxpool.Conn also satisfies every module's generated sqlc DBTX
// interface structurally, so a Pass binds it straight to its own New(db)
// constructor without this package naming any module's types.
type Pass func(ctx context.Context, conn *pgxpool.Conn) error

// Job runs one Pass on a schedule and participates in process shutdown.
type Job struct {
	name   string
	pool   *pgxpool.Pool
	cfg    Config
	lockID int64
	pass   Pass

	cancel    context.CancelFunc
	startOnce sync.Once
	stopOnce  sync.Once
	wg        sync.WaitGroup
}

// New builds a Job without starting it.
//
// name appears in every log line this job writes, and lockID is its advisory
// lock. lockID only has to be unique among this database's advisory locks;
// existing jobs use their migration's version number, which is unique by
// construction and says where to look.
func New(name string, pool *pgxpool.Pool, lockID int64, cfg Config, pass Pass) *Job {
	if cfg.Interval == 0 {
		cfg.Interval = DefaultInterval
	}
	if cfg.InitialDelay == 0 {
		cfg.InitialDelay = DefaultInitialDelay
	}

	return &Job{name: name, pool: pool, cfg: cfg, lockID: lockID, pass: pass}
}

// Start launches one owned goroutine. Idempotent; Stop cancels and waits for it,
// including an in-flight pass.
func (j *Job) Start(ctx context.Context) {
	j.startOnce.Do(func() {
		if j.cfg.Interval <= 0 {
			slog.WarnContext(ctx, "sweep not started: interval is not positive",
				"sweep", j.name, "interval", j.cfg.Interval)
			return
		}

		ctx, cancel := context.WithCancel(ctx)
		j.cancel = cancel
		j.wg.Go(func() {
			initialDelay := j.cfg.InitialDelay
			if initialDelay < 0 {
				initialDelay = 0
			}

			timer := time.NewTimer(initialDelay)
			defer timer.Stop()
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				j.run(ctx)
			}

			ticker := time.NewTicker(j.cfg.Interval)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					j.run(ctx)
				}
			}
		})
	})
}

func (j *Job) run(ctx context.Context) {
	if err := j.Sweep(ctx); err != nil {
		slog.ErrorContext(ctx, "sweep failed", "sweep", j.name, "error", err)
	}
}

// Stop cancels the scheduler and waits for it to exit.
func (j *Job) Stop() {
	j.stopOnce.Do(func() {
		if j.cancel != nil {
			j.cancel()
		}
		j.wg.Wait()
	})
}

// Sweep runs one pass. Losing the election is a successful no-op, not an error:
// on a three-replica deployment that is the ordinary outcome twice over.
//
// Exported so a test can drive a single deterministic pass without waiting out an
// interval, which is how both callers' integration tests work.
func (j *Job) Sweep(ctx context.Context) error {
	conn, err := j.pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire connection for the %s sweep: %w", j.name, err)
	}
	defer conn.Release()

	var locked bool
	if err := conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1::bigint)`, j.lockID).Scan(&locked); err != nil {
		return fmt.Errorf("acquire the %s sweep lock: %w", j.name, err)
	}
	if !locked {
		slog.DebugContext(ctx, "sweep skipped: another replica holds the lock", "sweep", j.name)
		return nil
	}
	defer func() {
		unlockCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), unlockTimeout)
		defer cancel()
		if _, err := conn.Exec(unlockCtx, `SELECT pg_advisory_unlock($1::bigint)`, j.lockID); err != nil {
			slog.ErrorContext(ctx, "failed to release the sweep lock", "sweep", j.name, "error", err)
		}
	}()

	return j.pass(ctx, conn)
}
