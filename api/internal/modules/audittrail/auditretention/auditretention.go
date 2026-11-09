// Package auditretention bounds audit_trail to each organization's retention.
//
// Every domain event lands in audit_trail, flag evaluations and usage reports
// included, and until this job nothing deleted a row: the contract term
// `audit-retention` ({"days": N}, a CONFIG entitlement of the licence) was
// declared and read by nobody, so every installation kept the trail forever,
// whatever the licence said.
//
// It reads that term per organization and deletes the entries older than the
// window in bounded batches. A deployment with no licensing authority -- every
// self-hosted one -- reads its own KAITEN_RETENTION_AUDIT_TRAIL_DAYS instead,
// and 0, the default, keeps every entry: an installation loses nothing by
// upgrading.
//
// A deleted entry cannot be brought back, so the window a delete acts on is
// always read live from the licensing authority, immediately before the delete,
// and never from the cache the other readers of a licence share: an organization
// that has just bought a longer retention must not lose what it paid to keep. An
// organization whose retention cannot be read keeps its entries.
//
// A pass goes round the organizations in turns until each is drained or the
// pass's time budget is spent, so that a backlog larger than one turn is still
// retired, and one organization's cannot starve the others'. Whatever a pass
// leaves unfinished is counted in kaiten.audit_trail.purge_incomplete.
//
// It lives in the audittrail module because audit_trail is its table, and it
// shares the scheduler and the cross-replica election of
// internal/infrastructure/sweep with the other sweeps, for the reason
// internal/modules/identity/tokenretention gives: the mechanism ships with the
// code that writes the rows.
package auditretention

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/infrastructure/db"
)

const (
	sweepName = "audit-trail-retention"
	// sweepLockKey only has to be unique among this database's advisory locks:
	// the version of the squash migration that created audit_trail, the house
	// convention for a sweep's lock.
	sweepLockKey = int64(20260810000000)

	// defaultBatchSize matches the transport sweeps'. One bounded DELETE per
	// statement keeps lock hold time and WAL predictable.
	defaultBatchSize = int32(1000)
	// batchesPerTurn is how much of one organization's backlog is deleted before
	// the others get their turn, and before its own window is read again.
	batchesPerTurn = 100
	// batchPause separates two batches. At the default batch size it still
	// retires tens of millions of rows an hour, far above what any organization
	// writes, while leaving room for autovacuum and replication during a first
	// drain.
	batchPause = 25 * time.Millisecond
	// purgeLockTimeout keeps a batch from queueing behind a transaction
	// writing to the same rows -- a reader marking notifications read.
	purgeLockTimeout = "1s"
	// retentionReadTimeout bounds one organization's retention lookup, which
	// may wait for a service token before the licensing client's own timeout
	// even starts.
	retentionReadTimeout = 15 * time.Second
	// maxConsecutiveReadFailures stops a pass that keeps failing to read
	// retention. The licensing authority is down, so every remaining
	// organization would wait out its own timeout only to keep its entries.
	maxConsecutiveReadFailures = 5

	meterName = "kaiten.audit_trail"
)

// Settings is how long the trail is kept, from the deployment's configuration.
type Settings struct {
	// RetentionDays is an organization's window when no licensing authority
	// answers for it; 0 keeps its trail forever.
	RetentionDays int
}

// Config is the schedule, the batch size and the deployment's own window.
type Config struct {
	InitialDelay time.Duration
	Interval     time.Duration
	// BatchSize is the rows per DELETE; 0 means 1000.
	BatchSize int32
	// MaxPassDuration is the time budget of one pass; 0 means half the interval.
	MaxPassDuration time.Duration
	Settings        Settings
}

// Job deletes expired audit trail entries on a schedule and participates in
// process shutdown.
type Job struct {
	pool   *pgxpool.Pool
	reader services.EntitlementConfig
	cfg    Config
	sweep  *sweep.Job

	rowsDeleted         metric.Int64Counter
	retentionUnknown    metric.Int64Counter
	retentionNotGranted metric.Int64Counter
	purgeIncomplete     metric.Int64Counter
}

// New builds the job without starting it. reader resolves each organization's
// retention; services.NoLicensingAuthority reads it from cfg.Settings for
// every organization.
func New(pool *pgxpool.Pool, reader services.EntitlementConfig, cfg Config) *Job {
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = defaultBatchSize
	}
	if cfg.MaxPassDuration <= 0 {
		interval := cfg.Interval
		if interval <= 0 {
			interval = sweep.DefaultInterval
		}
		cfg.MaxPassDuration = interval / 2
	}

	j := &Job{
		pool:   pool,
		reader: services.EntitlementConfigOrNone(reader),
		cfg:    cfg,
	}
	j.sweep = sweep.NewPoolPass(sweepName, pool, sweepLockKey, sweep.Config{
		InitialDelay: cfg.InitialDelay,
		Interval:     cfg.Interval,
	}, j.pass)
	j.initMetrics()
	return j
}

func (j *Job) initMetrics() {
	meter := otel.GetMeterProvider().Meter(meterName)
	var err error
	if j.rowsDeleted, err = meter.Int64Counter("kaiten.audit_trail.rows_deleted",
		metric.WithDescription("audit_trail entries deleted past their organization's retention, by the source of the window (licence or config)"),
		metric.WithUnit("{row}")); err != nil {
		slog.Warn("failed to register audit trail metric", "metric", "rows_deleted", "error", err)
	}
	if j.retentionUnknown, err = meter.Int64Counter("kaiten.audit_trail.retention_unknown",
		metric.WithDescription("Organizations whose audit retention could not be read in a pass, or read malformed, and whose entries were therefore kept"),
		metric.WithUnit("{organization}")); err != nil {
		slog.Warn("failed to register audit trail metric", "metric", "retention_unknown", "error", err)
	}
	if j.retentionNotGranted, err = meter.Int64Counter("kaiten.audit_trail.retention_not_granted",
		metric.WithDescription("Organizations whose licence does not grant audit-retention, and whose entries are therefore kept without bound"),
		metric.WithUnit("{organization}")); err != nil {
		slog.Warn("failed to register audit trail metric", "metric", "retention_not_granted", "error", err)
	}
	if j.purgeIncomplete, err = meter.Int64Counter("kaiten.audit_trail.purge_incomplete",
		metric.WithDescription("Organizations a pass left with expired entries, by reason (budget or lock_timeout); alert when it does not return to zero"),
		metric.WithUnit("{organization}")); err != nil {
		slog.Warn("failed to register audit trail metric", "metric", "purge_incomplete", "error", err)
	}
}

// Start launches the sweep. Nil-safe, so a caller does not branch on whether
// the deployment runs background work.
func (j *Job) Start(ctx context.Context) {
	if j == nil {
		return
	}
	j.sweep.Start(ctx)
}

// Stop cancels the scheduler and waits for it to exit, an in-flight pass
// included. Nil-safe for the same reason as Start.
func (j *Job) Stop() {
	if j == nil {
		return
	}
	j.sweep.Stop()
}

// Sweep runs one pass now, election included. Exported so a test can drive a
// pass without waiting out an interval.
func (j *Job) Sweep(ctx context.Context) error {
	if j == nil {
		return nil
	}
	return j.sweep.Sweep(ctx)
}

// turn is what one organization's turn of a pass came to.
type turn int

const (
	// turnFinished: nothing more to do for the organization in this pass.
	turnFinished turn = iota
	// turnAgain: its turn ran full, so it may have more to delete.
	turnAgain
	// turnUnreadable: its retention could not be read, and it kept its entries.
	turnUnreadable
)

// pass applies retention in turns until every organization is drained or the
// time budget is spent. It works through the pool, a connection per batch, so a
// slow licensing deployment holds nothing an API request could be waiting for.
//
// The organizations come in a random order, so that a budget spent early does
// not favour the same ones pass after pass.
func (j *Job) pass(ctx context.Context) error {
	deadline := time.Now().Add(j.cfg.MaxPassDuration)
	oldestExpirable := cutoff(time.Now().UTC(), minRetentionDays)
	pending, err := db.New(j.pool).ListOrganizationsWithAuditTrailBefore(ctx, pgtype.Timestamptz{Time: oldestExpirable, Valid: true})
	if err != nil {
		return fmt.Errorf("list organizations: %w", err)
	}
	rand.Shuffle(len(pending), func(a, b int) { pending[a], pending[b] = pending[b], pending[a] }) //nolint:gosec // an order of work, not a secret

	var errs []error
	readFailures := 0
	for len(pending) > 0 {
		var again []uuid.UUID
		for i, organizationID := range pending {
			if ctx.Err() != nil {
				return errors.Join(errs...)
			}
			if !time.Now().Before(deadline) {
				j.reportBudgetSpent(ctx, len(pending)-i+len(again))
				return errors.Join(errs...)
			}

			result, err := j.purgeTurn(ctx, organizationID)
			if err != nil {
				errs = append(errs, fmt.Errorf("purge organization %s: %w", organizationID, err))
			}
			switch result {
			case turnAgain:
				again = append(again, organizationID)
				readFailures = 0
			case turnUnreadable:
				readFailures++
				if readFailures >= maxConsecutiveReadFailures {
					j.reportAuthorityDown(ctx, len(pending)-i-1+len(again))
					return errors.Join(errs...)
				}
			case turnFinished:
				readFailures = 0
			}
		}
		pending = again
	}
	return errors.Join(errs...)
}

// purgeTurn reads the organization's window, live, and deletes up to
// batchesPerTurn batches past it. A window is never reused across turns, so a
// licence changed during a long pass applies from the organization's next turn.
func (j *Job) purgeTurn(ctx context.Context, organizationID uuid.UUID) (turn, error) {
	readCtx, cancel := context.WithTimeout(ctx, retentionReadTimeout)
	days, source := windowDays(readCtx, j.reader.LiveConfigValue, j.cfg.Settings, organizationID)
	cancel()
	switch source {
	case sourceUnknown:
		j.retentionUnknown.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", "unreadable")))
		slog.WarnContext(ctx, "audit_trail: retention could not be read, keeping the organization's entries", "organization_id", organizationID)
		return turnUnreadable, nil
	case sourceMalformed:
		j.retentionUnknown.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", "malformed")))
		slog.WarnContext(ctx, "audit_trail: retention is malformed, keeping the organization's entries", "organization_id", organizationID)
		return turnFinished, nil
	case sourceNotGranted:
		j.retentionNotGranted.Add(ctx, 1)
		return turnFinished, nil
	}
	if days == 0 {
		return turnFinished, nil // kept forever
	}

	expiry := cutoff(time.Now().UTC(), days)
	result, err := j.purge(organizationID, expiry).Run(ctx, j.pool)
	if result.Deleted > 0 {
		j.rowsDeleted.Add(ctx, result.Deleted, metric.WithAttributes(attribute.String("source", string(source))))
		slog.InfoContext(ctx, "audit_trail: deleted entries past the organization's retention",
			"organization_id", organizationID, "rows", result.Deleted, "retention_days", days, "cutoff", expiry)
	}
	if err != nil {
		return turnFinished, err
	}

	switch result.Stop {
	case sweep.BatchStopCapped:
		return turnAgain, nil
	case sweep.BatchStopLockTimeout:
		j.purgeIncomplete.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", "lock_timeout")))
		slog.WarnContext(ctx, "audit_trail: purge gave up on a lock, retrying the organization next pass",
			"organization_id", organizationID, "rows", result.Deleted, "cutoff", expiry)
	}
	return turnFinished, nil
}

func (j *Job) purge(organizationID uuid.UUID, expiry time.Time) sweep.BatchedDelete {
	return sweep.BatchedDelete{
		BatchSize:   j.cfg.BatchSize,
		MaxBatches:  batchesPerTurn,
		LockTimeout: purgeLockTimeout,
		Pause:       batchPause,
		Delete: func(ctx context.Context, tx pgx.Tx) (int64, error) {
			return db.New(tx).PurgeOrganizationAuditTrail(ctx, db.PurgeOrganizationAuditTrailParams{
				OrganizationID: organizationID,
				Cutoff:         pgtype.Timestamptz{Time: expiry, Valid: true},
				BatchSize:      j.cfg.BatchSize,
			})
		},
	}
}

func (j *Job) reportBudgetSpent(ctx context.Context, organizations int) {
	j.purgeIncomplete.Add(ctx, int64(organizations), metric.WithAttributes(attribute.String("reason", "budget")))
	slog.WarnContext(ctx, "audit_trail: pass ran out of time, continuing next pass",
		"organizations", organizations, "budget", j.cfg.MaxPassDuration)
}

func (j *Job) reportAuthorityDown(ctx context.Context, organizations int) {
	j.retentionUnknown.Add(ctx, int64(organizations), metric.WithAttributes(attribute.String("reason", "unreadable")))
	slog.WarnContext(ctx, "audit_trail: licensing authority keeps failing, keeping every remaining organization's entries this pass",
		"organizations", organizations)
}
