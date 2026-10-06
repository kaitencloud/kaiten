// Package billableusage is the usage journal as the billing module reads it:
// the instances module's implementation of billing's ports.UsageSource. The
// journal is written by the usage report and by nothing else; this package
// only reads it, and it is the only way billing does.
package billableusage

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usagehistory"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usageledger"
)

// Source implements ports.UsageSource.
type Source struct {
	pool      *pgxpool.Pool
	uof       *uow.UnitOfWork
	reader    *usagehistory.Reader
	retention usageledger.Retention
}

var _ ports.UsageSource = (*Source)(nil)

// New reads through pool for Seal, which runs its own transaction, and for
// reports, which are read page by page; through the transaction uof carries
// for the rest. retention is the organization's usage history window.
func New(pool *pgxpool.Pool, uof *uow.UnitOfWork, retention usageledger.Retention) *Source {
	return &Source{pool: pool, uof: uof, reader: usagehistory.NewReader(pool), retention: retention}
}

// ListReports reads one page of a pair's reports dated in [from, to).
func (s *Source) ListReports(ctx context.Context, ref ports.UsageRef, from, to time.Time, afterSeq int64, limit int32) ([]usagehistory.UsageReport, bool, error) {
	return s.reader.ListPair(ctx, usagehistory.PairQuery{
		OrganizationID: ref.OrganizationID, InstanceID: ref.InstanceID, EntitlementID: ref.EntitlementID,
		Range: usagehistory.Range{From: from, To: to}, AfterSeq: afterSeq, TransactionID: nil,
	}, limit)
}

// ExportReports streams a pair's reports dated in [from, to).
func (s *Source) ExportReports(ref ports.UsageRef, from, to time.Time, format usagehistory.Format, name string) *usagehistory.Export {
	return usagehistory.NewPairExport(s.reader, usagehistory.PairQuery{
		OrganizationID: ref.OrganizationID, InstanceID: ref.InstanceID, EntitlementID: ref.EntitlementID,
		Range: usagehistory.Range{From: from, To: to}, AfterSeq: 0, TransactionID: nil,
	}, format, name)
}

// RetentionMonths is the organization's usage history window.
func (s *Source) RetentionMonths(ctx context.Context, organizationID uuid.UUID) (int, bool) {
	return s.retention.Months(ctx, organizationID)
}

// RetentionStart is where the organization's usage history starts.
func (s *Source) RetentionStart(ctx context.Context, organizationID uuid.UUID, now time.Time) *time.Time {
	return s.retention.Start(ctx, organizationID, now)
}

// Seal takes the pair's report lock -- the one every report takes before it
// reads the clock -- so a report in flight has committed once it returns, then
// reads the clock every later report will be dated at or after.
func (s *Source) Seal(ctx context.Context, ref ports.UsageRef, through time.Time) (ports.Watermark, error) {
	var mark ports.Watermark
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		if err := q.LockEntitlementUsage(ctx, db.LockEntitlementUsageParams{
			InstanceID: ref.InstanceID, EntitlementID: ref.EntitlementID,
		}); err != nil {
			return err
		}
		now, err := q.GetDatabaseNow(ctx)
		if err != nil {
			return err
		}
		if now.Time.Before(through) {
			return ports.ErrClockBehind
		}
		seq, err := q.GetPairReportSeq(ctx, db.GetPairReportSeqParams{
			InstanceID: ref.InstanceID, EntitlementID: ref.EntitlementID,
		})
		if err != nil {
			return err
		}
		mark = ports.Watermark{ReportSeq: seq, SealedAt: now.Time.UTC()}
		return nil
	})
	return mark, err
}

// Summarize sums the pair's rows dated in [from, to) by reset window.
func (s *Source) Summarize(ctx context.Context, ref ports.UsageRef, from, to time.Time) (ports.UsageSummary, error) {
	q := db.New(s.uof.DBTX(ctx))
	windows, err := q.SummarizeUsageWindows(ctx, db.SummarizeUsageWindowsParams{
		OrganizationID: ref.OrganizationID, InstanceID: ref.InstanceID, EntitlementID: ref.EntitlementID,
		FromAt: timestamp(from), ToAt: timestamp(to),
	})
	if err != nil {
		return ports.UsageSummary{}, err
	}
	limits, err := q.SummarizeUsageLimits(ctx, db.SummarizeUsageLimitsParams{
		OrganizationID: ref.OrganizationID, InstanceID: ref.InstanceID, EntitlementID: ref.EntitlementID,
		FromAt: timestamp(from), ToAt: timestamp(to),
	})
	if err != nil {
		return ports.UsageSummary{}, err
	}

	summary := ports.UsageSummary{
		Windows: make([]ports.WindowSegment, 0, len(windows)),
		Limits:  make([]ports.AppliedLimit, 0, len(limits)),
		Fingerprint: ports.Fingerprint{
			FirstSeq: nil, LastSeq: nil, Rows: 0, SumDelta: decimal.Zero, SumOverage: decimal.Zero,
		},
	}
	for _, w := range windows {
		usage, err := decimal.NewFromString(w.Usage)
		if err != nil {
			return ports.UsageSummary{}, fmt.Errorf("window usage %q: %w", w.Usage, err)
		}
		overage, err := decimal.NewFromString(w.Overage)
		if err != nil {
			return ports.UsageSummary{}, fmt.Errorf("window overage %q: %w", w.Overage, err)
		}
		summary.Windows = append(summary.Windows, ports.WindowSegment{
			WindowStart: timePtr(w.WindowStart), WindowEnd: timePtr(w.WindowEnd),
			Usage: usage, Overage: overage, Rows: w.RowCount, FirstSeq: w.FirstSeq, LastSeq: w.LastSeq,
		})
		fp := &summary.Fingerprint
		if fp.FirstSeq == nil || w.FirstSeq < *fp.FirstSeq {
			first := w.FirstSeq
			fp.FirstSeq = &first
		}
		if fp.LastSeq == nil || w.LastSeq > *fp.LastSeq {
			last := w.LastSeq
			fp.LastSeq = &last
		}
		fp.Rows += w.RowCount
		fp.SumDelta = fp.SumDelta.Add(usage)
		fp.SumOverage = fp.SumOverage.Add(overage)
	}
	for _, l := range limits {
		applied := ports.AppliedLimit{Limit: nil, OveragePercent: int32(l.OveragePercent), Rows: l.RowCount}
		if l.LimitValue != "" {
			limit, err := decimal.NewFromString(l.LimitValue)
			if err != nil {
				return ports.UsageSummary{}, fmt.Errorf("limit %q: %w", l.LimitValue, err)
			}
			applied.Limit = &limit
		}
		summary.Limits = append(summary.Limits, applied)
	}
	return summary, nil
}

// CheckInvariants evaluates the three journal invariants in one statement.
func (s *Source) CheckInvariants(ctx context.Context, ref ports.UsageRef, from, to time.Time, prev *ports.Fingerprint) ([]ports.InvariantFailure, error) {
	row, err := db.New(s.uof.DBTX(ctx)).CheckUsageLedgerInvariants(ctx, db.CheckUsageLedgerInvariantsParams{
		OrganizationID: ref.OrganizationID, InstanceID: ref.InstanceID, EntitlementID: ref.EntitlementID,
		FromAt: timestamp(from), ToAt: timestamp(to),
	})
	if err != nil {
		return nil, err
	}
	return Evaluate(row, prev), nil
}

// Evaluate turns the invariant statement's answers into failures, in
// invariant order. An empty period checks the counter only.
func Evaluate(row db.CheckUsageLedgerInvariantsRow, prev *ports.Fingerprint) []ports.InvariantFailure {
	var failures []ports.InvariantFailure
	var first, last, counter *int64
	if row.RowCount > 0 {
		first, last = &row.FirstSeq, &row.LastSeq
	}
	if row.CounterSeq >= 0 {
		counter = &row.CounterSeq
	}
	fail := func(invariant ports.Invariant, expected, found string) {
		failures = append(failures, ports.InvariantFailure{
			Invariant: invariant, Expected: expected, Found: found,
			FirstSeq: first, LastSeq: last, CounterReportSeq: counter,
		})
	}

	if row.RowCount > 0 {
		switch {
		case prev != nil && prev.LastSeq != nil && row.FirstSeq != *prev.LastSeq+1:
			fail(ports.InvariantSequenceGap,
				fmt.Sprintf("the period starts at report %d, right after the previous invoice", *prev.LastSeq+1),
				fmt.Sprintf("it starts at report %d", row.FirstSeq))
		case row.FirstSeq > 1 && !row.PredExists && row.LowerExists:
			fail(ports.InvariantSequenceGap,
				fmt.Sprintf("report %d, the one before the period's first", row.FirstSeq-1),
				"it is missing while earlier reports remain")
		case row.CounterSeq < row.LastSeq:
			fail(ports.InvariantSequenceGap,
				fmt.Sprintf("a counter at report %d or later", row.LastSeq),
				fmt.Sprintf("the counter is at report %d", row.CounterSeq))
		case row.SeqsPresent != row.CounterSeq-row.FirstSeq+1:
			fail(ports.InvariantSequenceGap,
				fmt.Sprintf("%d reports from %d to %d", row.CounterSeq-row.FirstSeq+1, row.FirstSeq, row.CounterSeq),
				fmt.Sprintf("%d of them", row.SeqsPresent))
		}

		switch {
		case row.FirstChainBreak > 0:
			fail(ports.InvariantChainBreak,
				fmt.Sprintf("report %d starts where the previous report of its window ended", row.FirstChainBreak),
				"it starts elsewhere")
		case row.FirstWindowStartBreak > 0:
			fail(ports.InvariantChainBreak,
				fmt.Sprintf("report %d, the first of its window, starts at 0", row.FirstWindowStartBreak),
				"it starts elsewhere")
		}
	}

	if row.TailExists && row.TailInCounterWindow && !row.TailMatchesCounter {
		fail(ports.InvariantCounterMismatch,
			fmt.Sprintf("the counter equals the last report's value after, %s", row.TailValueAfter),
			fmt.Sprintf("the counter is %s", row.CounterValue))
	}
	return failures
}

func timestamp(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t.UTC(), InfinityModifier: pgtype.Finite, Valid: true}
}

func timePtr(ts pgtype.Timestamp) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time.UTC()
	return &t
}
