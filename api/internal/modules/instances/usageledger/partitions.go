// Package usageledger keeps the usage journal (usage_ledger): its monthly
// partitions, and how long its rows are kept.
//
// The journal is written by every accepted usage report, so a month with no
// partition is a month in which every report fails with 503 LedgerUnavailable.
// Partitions are therefore created a year ahead: by the migration, by every
// replica before it reports ready, and by a daily pass. The same pass applies
// retention, by dropping whole old partitions and deleting the older rows of
// organizations that keep less history than that.
package usageledger

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

const (
	partitionPrefix = "usage_ledger_p"
	// monthsAhead is how far ahead partitions are kept, monthsBehind how far
	// behind the current month they are ensured -- the migration's -1..+12.
	monthsAhead  = 12
	monthsBehind = 1
	// lowMonthsAhead is where a short runway is worth an alert: under three
	// months, the daily pass has been failing for weeks.
	lowMonthsAhead = 3
	// ddlLockTimeout bounds how long partition DDL waits for its lock on
	// usage_ledger. CREATE ... PARTITION OF and DETACH take ACCESS EXCLUSIVE on
	// the parent, which queues every report behind them: better to give up and
	// retry later than to stall reports.
	ddlLockTimeout = "2s"
)

// database is what partition maintenance runs on: a pool or the connection a
// sweep holds.
type database interface {
	db.DBTX
	Begin(ctx context.Context) (pgx.Tx, error)
}

// monthStart is the first instant of t's UTC month.
func monthStart(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

// partitionName names the partition holding the month starting at month.
func partitionName(month time.Time) string {
	return fmt.Sprintf("%s%04d_%02d", partitionPrefix, month.Year(), int(month.Month()))
}

// parsePartitionName is partitionName's inverse; false for any other name.
func parsePartitionName(name string) (time.Time, bool) {
	var year, month int
	if _, err := fmt.Sscanf(name, partitionPrefix+"%04d_%02d", &year, &month); err != nil || month < 1 || month > 12 {
		return time.Time{}, false
	}
	start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	if partitionName(start) != name {
		return time.Time{}, false
	}
	return start, true
}

// plannedMonths are the months that must have a partition at now: the
// previous month through twelve months ahead.
func plannedMonths(now time.Time) []time.Time {
	current := monthStart(now)
	months := make([]time.Time, 0, monthsBehind+1+monthsAhead)
	for k := -monthsBehind; k <= monthsAhead; k++ {
		months = append(months, period.AddMonths(current, k))
	}
	return months
}

// attachedMonths lists the months whose partition is attached to usage_ledger.
func attachedMonths(ctx context.Context, conn db.DBTX) ([]time.Time, error) {
	names, err := db.New(conn).ListUsageLedgerPartitions(ctx)
	if err != nil {
		return nil, fmt.Errorf("list usage_ledger partitions: %w", err)
	}
	months := make([]time.Time, 0, len(names))
	for _, name := range names {
		if month, ok := parsePartitionName(name); ok {
			months = append(months, month)
		}
	}
	return months, nil
}

// monthsAheadOf counts the consecutive months after now's that have a
// partition: 12 when the runway is full.
func monthsAheadOf(now time.Time, attached []time.Time) int {
	ahead := 0
	for k := 1; k <= monthsAhead; k++ {
		if !slices.ContainsFunc(attached, period.AddMonths(monthStart(now), k).Equal) {
			break
		}
		ahead++
	}
	return ahead
}

// ensurePartitions creates every planned month that has no partition and
// returns how many months ahead are covered afterwards. It keeps going past a
// month it could not create, and returns the first such error along with the
// runway it did achieve.
func ensurePartitions(ctx context.Context, conn database, now time.Time, lockID int64) (int, error) {
	attached, err := attachedMonths(ctx, conn)
	if err != nil {
		return 0, err
	}

	var firstErr error
	for _, month := range plannedMonths(now) {
		if slices.ContainsFunc(attached, month.Equal) {
			continue
		}
		if err := createPartition(ctx, conn, month, lockID); err != nil {
			firstErr = cmpErr(firstErr, fmt.Errorf("create %s: %w", partitionName(month), err))
			continue
		}
		attached = append(attached, month)
	}
	return monthsAheadOf(now, attached), firstErr
}

// createPartition creates one month's partition, serialized by lockID across
// replicas: two concurrent CREATE TABLE IF NOT EXISTS of the same name can
// still collide in the catalog.
func createPartition(ctx context.Context, conn database, month time.Time, lockID int64) error {
	next := period.AddMonths(month, 1)
	statement := fmt.Sprintf(
		`CREATE TABLE IF NOT EXISTS %s PARTITION OF "usage_ledger" FOR VALUES FROM ('%s') TO ('%s')`,
		pgx.Identifier{partitionName(month)}.Sanitize(),
		month.Format(time.DateTime), next.Format(time.DateTime),
	)
	return inLockedTx(ctx, conn, lockID, statement)
}

// dropPartition detaches and drops one partition.
func dropPartition(ctx context.Context, conn database, month time.Time, lockID int64) error {
	name := pgx.Identifier{partitionName(month)}.Sanitize()
	return inLockedTx(ctx, conn, lockID,
		`ALTER TABLE "usage_ledger" DETACH PARTITION `+name,
		`DROP TABLE `+name,
	)
}

// inLockedTx runs statements in one transaction holding lockID, with the DDL
// lock timeout.
func inLockedTx(ctx context.Context, conn database, lockID int64, statements ...string) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1::bigint)`, lockID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `SET LOCAL lock_timeout = '`+ddlLockTimeout+`'`); err != nil {
		return err
	}
	for _, statement := range statements {
		if _, err := tx.Exec(ctx, statement); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// isLockTimeout reports whether err is a statement that gave up waiting for its
// lock -- an expected outcome of maintenance under load, retried next pass.
func isLockTimeout(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "55P03"
}

func cmpErr(first, next error) error {
	if first != nil {
		return first
	}
	return next
}
