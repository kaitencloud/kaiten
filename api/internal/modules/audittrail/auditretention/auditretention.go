// Package auditretention bounds audit_trail to each organization's retention.
//
// Every domain event lands in audit_trail, flag evaluations and usage reports
// included, and until this job nothing deleted a row: the contract term
// `audit-retention` ({"days": N}, a CONFIG entitlement of the licence) was
// declared and read by nobody, so every installation kept the trail forever,
// whatever the licence said.
//
// It reads that term per organization the way the usage-ledger maintenance
// reads `usage-history-retention`, and deletes the entries older than the
// window in bounded batches. A deployment with no licensing authority -- every
// self-hosted one -- reads its own KAITEN_RETENTION_AUDIT_TRAIL_DAYS instead,
// and 0, the default, keeps every entry: an installation loses nothing by
// upgrading. An organization whose retention cannot be read keeps its rows.
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
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
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
	// maxBatchesPerOrganization caps one organization's deletes in a pass, so
	// a backlog that accumulated since before this job existed is retired over
	// successive passes rather than in one run that monopolises the table the
	// notification feed reads.
	maxBatchesPerOrganization = 100
	// purgeLockTimeout keeps a batch from queueing behind a transaction
	// writing to the same rows -- the subscriber appending entries, a reader
	// marking notifications read.
	purgeLockTimeout = "1s"
	// retentionReadTimeout bounds one organization's retention lookup, which
	// may wait for the licensing deployment's client: a pass must not hold the
	// sweep lock on a deployment that never answers.
	retentionReadTimeout = 15 * time.Second

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
	Settings  Settings
}

// Job deletes expired audit trail entries on a schedule and participates in
// process shutdown.
type Job struct {
	pool   *pgxpool.Pool
	reader services.EntitlementConfig
	cfg    Config
	sweep  *sweep.Job

	rowsDeleted      metric.Int64Counter
	retentionUnknown metric.Int64Counter
}

// New builds the job without starting it. reader resolves each organization's
// retention; services.NoLicensingAuthority reads it from cfg.Settings for
// every organization.
func New(pool *pgxpool.Pool, reader services.EntitlementConfig, cfg Config) *Job {
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = defaultBatchSize
	}

	j := &Job{
		pool:   pool,
		reader: services.EntitlementConfigOrNone(reader),
		cfg:    cfg,
	}
	j.sweep = sweep.New(sweepName, pool, sweepLockKey, sweep.Config{
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
		metric.WithDescription("Organizations whose audit retention could not be read in a pass, and whose entries were therefore kept"),
		metric.WithUnit("{organization}")); err != nil {
		slog.Warn("failed to register audit trail metric", "metric", "retention_unknown", "error", err)
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

// pass applies retention organization by organization, on the connection that
// holds the sweep lock. An organization whose retention is unknown keeps its
// entries; one that keeps them forever costs one lookup.
func (j *Job) pass(ctx context.Context, conn *pgxpool.Conn) error {
	now := time.Now().UTC()
	organizations, err := db.New(conn).ListOrganizationIDs(ctx)
	if err != nil {
		return fmt.Errorf("list organizations: %w", err)
	}

	var errs []error
	for _, organizationID := range organizations {
		if ctx.Err() != nil {
			break
		}

		readCtx, cancel := context.WithTimeout(ctx, retentionReadTimeout)
		days, source := windowDays(readCtx, j.reader, j.cfg.Settings, organizationID)
		cancel()
		switch {
		case source == sourceUnknown:
			j.retentionUnknown.Add(ctx, 1)
			slog.WarnContext(ctx, "audit_trail: retention unknown, keeping the organization's entries", "organization_id", organizationID)
			continue
		case days == 0:
			continue // kept forever
		}

		cutoff := now.AddDate(0, 0, -days)
		deleted, err := j.purgeOrganization(ctx, conn, organizationID, cutoff)
		if deleted > 0 {
			j.rowsDeleted.Add(ctx, deleted, metric.WithAttributes(attribute.String("source", string(source))))
			slog.InfoContext(ctx, "audit_trail: deleted entries past the organization's retention",
				"organization_id", organizationID, "rows", deleted, "retention_days", days, "cutoff", cutoff)
		}
		if err != nil {
			errs = append(errs, fmt.Errorf("purge organization %s: %w", organizationID, err))
		}
	}
	return errors.Join(errs...)
}

// purgeOrganization deletes the organization's entries older than cutoff in
// short batches, each its own transaction, stopping at the first short batch,
// at a lock timeout (retried next pass) or after maxBatchesPerOrganization.
func (j *Job) purgeOrganization(ctx context.Context, conn *pgxpool.Conn, organizationID uuid.UUID, cutoff time.Time) (int64, error) {
	var total int64
	for range maxBatchesPerOrganization {
		if ctx.Err() != nil {
			return total, nil
		}
		deleted, err := j.purgeBatch(ctx, conn, organizationID, cutoff)
		total += deleted
		if err != nil {
			if isLockTimeout(err) {
				return total, nil
			}
			return total, err
		}
		if deleted < int64(j.cfg.BatchSize) {
			break
		}
	}
	return total, nil
}

func (j *Job) purgeBatch(ctx context.Context, conn *pgxpool.Conn, organizationID uuid.UUID, cutoff time.Time) (int64, error) {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	if _, err := tx.Exec(ctx, `SET LOCAL lock_timeout = '`+purgeLockTimeout+`'`); err != nil {
		return 0, err
	}
	deleted, err := db.New(tx).PurgeOrganizationAuditTrail(ctx, db.PurgeOrganizationAuditTrailParams{
		OrganizationID: organizationID,
		Cutoff:         pgtype.Timestamptz{Time: cutoff, Valid: true},
		BatchSize:      j.cfg.BatchSize,
	})
	if err != nil {
		return 0, err
	}
	return deleted, tx.Commit(ctx)
}

// isLockTimeout recognises PostgreSQL's lock_not_available (55P03), the error
// SET LOCAL lock_timeout turns a wait into.
func isLockTimeout(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "55P03"
}
