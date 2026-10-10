package usageledger

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

const (
	sweepName = "usage-ledger-maintenance"
	// sweepLockID elects one replica per pass: the version of the migration that
	// created the journal, the house convention for a sweep's lock.
	sweepLockID = int64(20261005170000)
	// ddlLockID serializes partition DDL across replicas, the readiness check and
	// the pass alike.
	ddlLockID = sweepLockID + 1

	defaultInterval       = 24 * time.Hour
	defaultPurgeBatchSize = int32(5000)
	// maxPurgeBatches caps one organization's deletes in a pass, so a large
	// backlog after a retention downgrade is retired over several days rather
	// than in one long pass.
	maxPurgeBatches = 200
	// purgeLockTimeout keeps a purge batch from queueing behind, or in front of,
	// the reports writing to the same partitions.
	purgeLockTimeout = "1s"
	// retentionReadTimeout bounds one organization's retention lookup, which may
	// wait for the licensing deployment's client: a pass must not hold the sweep
	// lock on a deployment that never answers.
	retentionReadTimeout = 15 * time.Second

	meterName = "kaiten.usage.ledger"
)

// Config schedules the maintenance pass and says how long rows are kept.
type Config struct {
	// Interval between passes; below 0 disables the pass, 0 means daily.
	Interval     time.Duration
	InitialDelay time.Duration
	// PurgeBatchSize is the rows per DELETE; 0 means 5000.
	PurgeBatchSize int32
	Settings       Settings
}

// Maintenance keeps the journal's partitions a year ahead and applies its
// retention: a daily pass elected on one replica, and EnsureReady, which every
// replica runs before it serves.
type Maintenance struct {
	pool   *pgxpool.Pool
	reader services.EntitlementConfig
	cfg    Config
	sweep  *sweep.Job

	partitionsAhead   metric.Int64Gauge
	partitionsDropped metric.Int64Counter
	rowsDeleted       metric.Int64Counter
	retentionUnknown  metric.Int64Counter
}

// New builds the maintenance without starting its pass. reader resolves each
// organization's retention; services.NoLicensingAuthority reads it from
// cfg.Settings for every organization.
func New(pool *pgxpool.Pool, reader services.EntitlementConfig, cfg Config) *Maintenance {
	if cfg.Interval == 0 {
		cfg.Interval = defaultInterval
	}
	if cfg.PurgeBatchSize <= 0 {
		cfg.PurgeBatchSize = defaultPurgeBatchSize
	}

	m := &Maintenance{
		pool:   pool,
		reader: services.EntitlementConfigOrNone(reader),
		cfg:    cfg,
	}
	m.sweep = sweep.New(sweepName, pool, sweepLockID, sweep.Config{
		InitialDelay: cfg.InitialDelay,
		Interval:     cfg.Interval,
	}, m.pass)
	m.initMetrics()
	return m
}

func (m *Maintenance) initMetrics() {
	meter := otel.GetMeterProvider().Meter(meterName)
	var err error
	if m.partitionsAhead, err = meter.Int64Gauge("kaiten.usage.ledger.partitions_ahead",
		metric.WithDescription("Months after the current one that have a usage_ledger partition; alert below 3"),
		metric.WithUnit("{month}")); err != nil {
		slog.Warn("failed to register usage ledger metric", "metric", "partitions_ahead", "error", err)
	}
	if m.partitionsDropped, err = meter.Int64Counter("kaiten.usage.ledger.partitions_dropped",
		metric.WithDescription("usage_ledger partitions dropped whole, past the retention ceiling"),
		metric.WithUnit("{partition}")); err != nil {
		slog.Warn("failed to register usage ledger metric", "metric", "partitions_dropped", "error", err)
	}
	if m.rowsDeleted, err = meter.Int64Counter("kaiten.usage.ledger.rows_deleted",
		metric.WithDescription("usage_ledger rows deleted for organizations that keep less history than the ceiling"),
		metric.WithUnit("{row}")); err != nil {
		slog.Warn("failed to register usage ledger metric", "metric", "rows_deleted", "error", err)
	}
	if m.retentionUnknown, err = meter.Int64Counter("kaiten.usage.ledger.retention_unknown",
		metric.WithDescription("Organizations whose retention could not be read in a pass, and whose rows were therefore kept"),
		metric.WithUnit("{organization}")); err != nil {
		slog.Warn("failed to register usage ledger metric", "metric", "retention_unknown", "error", err)
	}
}

// Start launches the daily pass. Idempotent; Stop cancels it and waits,
// including an in-flight pass.
func (m *Maintenance) Start(ctx context.Context) { m.sweep.Start(ctx) }

// Stop cancels the pass and waits for it to exit.
func (m *Maintenance) Stop() { m.sweep.Stop() }

// Sweep runs one pass now, election included. Exported for tests.
func (m *Maintenance) Sweep(ctx context.Context) error { return m.sweep.Sweep(ctx) }

// EnsureReady creates any missing partition of the previous month through
// twelve months ahead, then fails only if a month reports can land in right
// now has none: the current month, and the next one within a day of the
// month's end. A later month that could not be created is logged and left to
// the daily pass -- an alert, not a reason to refuse traffic.
func (m *Maintenance) EnsureReady(ctx context.Context) error {
	now, err := databaseNow(ctx, m.pool)
	if err != nil {
		return err
	}

	ahead, err := ensurePartitions(ctx, m.pool, now, ddlLockID)
	m.partitionsAhead.Record(ctx, int64(ahead))
	if err != nil {
		slog.WarnContext(ctx, "usage_ledger: could not create every partition ahead", "months_ahead", ahead, "error", err)
	}

	attached, err := attachedMonths(ctx, m.pool)
	if err != nil {
		return err
	}
	required := []time.Time{monthStart(now)}
	if next := period.AddMonths(monthStart(now), 1); next.Sub(now) <= 24*time.Hour {
		required = append(required, next)
	}
	for _, month := range required {
		if !slices.ContainsFunc(attached, month.Equal) {
			return fmt.Errorf("usage_ledger has no partition %s: every usage report dated in it would fail", partitionName(month))
		}
	}
	return nil
}

// pass is one elected maintenance pass, on the connection holding the sweep
// lock. Each step runs whatever the previous one did: a partition that could
// not be created must not stop retention, nor the reverse.
func (m *Maintenance) pass(ctx context.Context, conn *pgxpool.Conn) error {
	now, err := databaseNow(ctx, conn)
	if err != nil {
		return err
	}

	var errs []error
	ahead, err := ensurePartitions(ctx, conn, now, ddlLockID)
	m.partitionsAhead.Record(ctx, int64(ahead))
	if err != nil {
		errs = append(errs, err)
	}
	if ahead < lowMonthsAhead {
		slog.ErrorContext(ctx, "usage_ledger: fewer than three months of partitions ahead; reports will fail once they run out",
			"months_ahead", ahead)
	}

	if err := m.dropExpired(ctx, conn, now); err != nil {
		errs = append(errs, err)
	}
	if err := m.purgeOrganizations(ctx, conn, now); err != nil {
		errs = append(errs, err)
	}
	return errors.Join(errs...)
}

// dropExpired drops every partition whose month ended before the drop ceiling:
// the cheap purge, a catalog operation rather than a DELETE.
//
// Rows that are not invoiced yet must never be purged, whatever the
// retention (D-33): a partition past the ceiling that still holds one, for
// instance an annual arrears subscription's usage, is kept and warned about
// until the close has billed it.
func (m *Maintenance) dropExpired(ctx context.Context, conn *pgxpool.Conn, now time.Time) error {
	ceiling, enabled := m.cfg.Settings.dropCeilingMonths()
	if !enabled {
		return nil
	}
	boundary := period.AddMonths(now, -ceiling)

	attached, err := attachedMonths(ctx, conn)
	if err != nil {
		return err
	}
	var errs []error
	for _, month := range attached {
		if period.AddMonths(month, 1).After(boundary) {
			continue
		}
		protected, err := db.New(conn).HasProtectedUsageLedgerRows(ctx, db.HasProtectedUsageLedgerRowsParams{
			RangeStart: pgtype.Timestamp{Time: month, Valid: true},
			RangeEnd:   pgtype.Timestamp{Time: period.AddMonths(month, 1), Valid: true},
		})
		if err != nil {
			errs = append(errs, fmt.Errorf("check %s for protected rows: %w", partitionName(month), err))
			continue
		}
		if protected {
			slog.WarnContext(ctx, "usage_ledger: partition past the retention ceiling holds rows that are not invoiced yet, keeping it",
				"partition", partitionName(month), "ceiling_months", ceiling)
			continue
		}
		if err := dropPartition(ctx, conn, month, ddlLockID); err != nil {
			if isLockTimeout(err) {
				slog.WarnContext(ctx, "usage_ledger: partition drop timed out on its lock, retrying next pass", "partition", partitionName(month))
				continue
			}
			errs = append(errs, fmt.Errorf("drop %s: %w", partitionName(month), err))
			continue
		}
		m.partitionsDropped.Add(ctx, 1)
		slog.InfoContext(ctx, "usage_ledger: dropped a partition past the retention ceiling",
			"partition", partitionName(month), "ceiling_months", ceiling)
	}
	return errors.Join(errs...)
}

// purgeOrganizations deletes, organization by organization, the rows older
// than its window, for every organization keeping less history than the drop
// ceiling (or every organization with a finite window when dropping is off).
// An organization whose retention is unknown keeps its rows.
func (m *Maintenance) purgeOrganizations(ctx context.Context, conn *pgxpool.Conn, now time.Time) error {
	organizations, err := db.New(conn).ListUsageLedgerOrganizations(ctx)
	if err != nil {
		return fmt.Errorf("list usage_ledger organizations: %w", err)
	}
	ceiling, dropEnabled := m.cfg.Settings.dropCeilingMonths()

	var errs []error
	for _, organizationID := range organizations {
		if ctx.Err() != nil {
			break
		}

		readCtx, cancel := context.WithTimeout(ctx, retentionReadTimeout)
		months, source := windowMonths(readCtx, m.reader, m.cfg.Settings, organizationID)
		cancel()
		switch {
		case source == sourceUnknown:
			m.retentionUnknown.Add(ctx, 1)
			slog.WarnContext(ctx, "usage_ledger: retention unknown, keeping the organization's rows", "organization_id", organizationID)
			continue
		case months == 0:
			continue // kept forever
		case dropEnabled && months >= ceiling:
			continue // dropping partitions already applies it
		}

		cutoff := m.cfg.Settings.cutoff(now, months)
		deleted, err := m.purgeOrganization(ctx, conn, organizationID, cutoff)
		if deleted > 0 {
			m.rowsDeleted.Add(ctx, deleted, metric.WithAttributes(attribute.String("source", string(source))))
			slog.InfoContext(ctx, "usage_ledger: deleted rows past the organization's retention",
				"organization_id", organizationID, "rows", deleted, "retention_months", months, "cutoff", cutoff)
		}
		if err != nil {
			errs = append(errs, fmt.Errorf("purge organization %s: %w", organizationID, err))
		}
	}
	return errors.Join(errs...)
}

// purgeOrganization deletes the organization's rows older than cutoff in
// short batches, each its own transaction, stopping at the first short batch
// or after maxPurgeBatches.
func (m *Maintenance) purgeOrganization(ctx context.Context, conn *pgxpool.Conn, organizationID uuid.UUID, cutoff time.Time) (int64, error) {
	var total int64
	for range maxPurgeBatches {
		if ctx.Err() != nil {
			return total, nil
		}
		deleted, err := purgeBatch(ctx, conn, organizationID, cutoff, m.cfg.PurgeBatchSize)
		total += deleted
		if err != nil {
			if isLockTimeout(err) {
				return total, nil // retried next pass
			}
			return total, err
		}
		if deleted < int64(m.cfg.PurgeBatchSize) {
			break
		}
	}
	return total, nil
}

func purgeBatch(ctx context.Context, conn *pgxpool.Conn, organizationID uuid.UUID, cutoff time.Time, batchSize int32) (int64, error) {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	if _, err := tx.Exec(ctx, `SET LOCAL lock_timeout = '`+purgeLockTimeout+`'`); err != nil {
		return 0, err
	}
	deleted, err := db.New(tx).PurgeOrganizationUsageLedger(ctx, db.PurgeOrganizationUsageLedgerParams{
		OrganizationID: organizationID,
		Cutoff:         pgtype.Timestamp{Time: cutoff, Valid: true},
		BatchSize:      batchSize,
	})
	if err != nil {
		return 0, err
	}
	return deleted, tx.Commit(ctx)
}

// databaseNow is the usage clock, so partition months and retention cutoffs
// are computed on the instant reports are dated by.
func databaseNow(ctx context.Context, conn db.DBTX) (time.Time, error) {
	now, err := db.New(conn).GetDatabaseNow(ctx)
	if err != nil {
		return time.Time{}, fmt.Errorf("read the database clock: %w", err)
	}
	return now.Time.UTC(), nil
}
