// Package billableusage is the usage journal as the billing module reads it:
// the instances module's implementation of billing's ports.UsageSource. The
// journal is written by the usage report and by nothing else; this package
// only reads it, and it is the only way billing does.
package billableusage

import (
	"context"
	"fmt"
	"strconv"
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
	fail := func(invariant ports.Invariant, expected, found *string, report *int64, detail string) {
		failures = append(failures, ports.InvariantFailure{
			Invariant: invariant, Expected: expected, Found: found, Detail: detail, ReportSeq: report,
			FirstSeq: first, LastSeq: last, CounterReportSeq: counter,
		})
	}
	seq := func(n int64) *string { s := strconv.FormatInt(n, 10); return &s }
	value := func(v string) *string { return &v }
	at := func(n int64) *int64 { return &n }

	if row.RowCount > 0 {
		switch {
		case prev != nil && prev.LastSeq != nil && row.FirstSeq != *prev.LastSeq+1:
			fail(ports.InvariantSequenceGap, seq(*prev.LastSeq+1), seq(row.FirstSeq), at(row.FirstSeq),
				fmt.Sprintf("the period should start at report %d, right after the previous invoice; it starts at report %d", *prev.LastSeq+1, row.FirstSeq))
		case row.FirstSeq > 1 && !row.PredExists && row.LowerExists:
			fail(ports.InvariantSequenceGap, seq(row.FirstSeq-1), nil, at(row.FirstSeq-1),
				fmt.Sprintf("report %d, the one before the period's first, is missing while earlier reports remain", row.FirstSeq-1))
		case row.CounterSeq < row.LastSeq:
			fail(ports.InvariantSequenceGap, seq(row.LastSeq), seq(row.CounterSeq), nil,
				fmt.Sprintf("the counter should be at report %d or later; it is at report %d", row.LastSeq, row.CounterSeq))
		case row.SeqsPresent != row.CounterSeq-row.FirstSeq+1:
			fail(ports.InvariantSequenceGap, seq(row.CounterSeq-row.FirstSeq+1), seq(row.SeqsPresent), nil,
				fmt.Sprintf("reports %d to %d should all be there; %d of them are", row.FirstSeq, row.CounterSeq, row.SeqsPresent))
		}

		switch {
		case row.FirstChainBreak > 0:
			fail(ports.InvariantChainBreak, nil, nil, at(row.FirstChainBreak),
				fmt.Sprintf("report %d should start where the previous report of its window ended; it starts elsewhere", row.FirstChainBreak))
		case row.FirstWindowStartBreak > 0:
			fail(ports.InvariantChainBreak, value("0"), nil, at(row.FirstWindowStartBreak),
				fmt.Sprintf("report %d, the first of its window, should start at 0; it starts elsewhere", row.FirstWindowStartBreak))
		}
	}

	if row.TailExists && row.TailInCounterWindow && !row.TailMatchesCounter {
		fail(ports.InvariantCounterMismatch, value(row.TailValueAfter), value(row.CounterValue), last,
			fmt.Sprintf("the counter should equal the last report's value after, %s; it is %s", row.TailValueAfter, row.CounterValue))
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
