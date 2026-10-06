package billing_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/metering"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/billableusage"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usageledger"
	licenseschema "github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
)

// journalRow is one usage_ledger row as a test writes it.
type journalRow struct {
	seq                 int64
	reportedAt          string
	behavior            string
	sent, before, after string
	window              string // "2027-01" or "2027-02"
	limit               string
	overagePercent      int
}

// exampleJournal is a month of tokens on a 100,000 @ 50 % grant, raised to
// 150,000 on 02-05: report 40 predates the period, 41 is a downward set, 45
// lands exactly on the boundary.
var exampleJournal = []journalRow{
	{40, "2027-01-10 08:00:00", "append", "120000", "0", "120000", "2027-01", "100000", 50},
	{41, "2027-01-20 10:00:00", "set", "105000", "120000", "105000", "2027-01", "100000", 50},
	{42, "2027-01-25 10:00:00", "append", "2000", "105000", "107000", "2027-01", "100000", 50},
	{43, "2027-02-03 10:00:00", "append", "60000", "0", "60000", "2027-02", "100000", 50},
	{44, "2027-02-10 10:00:00", "append", "120500", "60000", "180500", "2027-02", "150000", 50},
	{45, "2027-02-15 00:00:00", "append", "1000", "180500", "181500", "2027-02", "150000", 50},
}

var (
	periodFrom = time.Date(2027, 1, 15, 0, 0, 0, 0, time.UTC)
	periodTo   = time.Date(2027, 2, 15, 0, 0, 0, 0, time.UTC)
)

// journalPair creates an instance granted tokens and writes rows and its
// counter straight to the tables, the way the usage report would have.
func journalPair(t *testing.T, rows []journalRow, counter string, counterSeq int64) ports.UsageRef {
	t.Helper()
	tokens := newEntitlement(t, "tokens", 10000)
	version := newVersion(t, "Pro", licenseschema.Published)
	grant(t, version.Slug, "tokens", 100000, 50)
	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, version.ID)
	ref := ports.UsageRef{OrganizationID: testDb.DefaultData.OrganizationID, InstanceID: instance.ID, EntitlementID: tokens}

	for _, r := range rows {
		writeJournalRow(t, ref, version.ID, r)
	}
	_, err := testDb.DbPool.Exec(t.Context(), `
		INSERT INTO entitlement_usage (entitlement_id, instance_id, organization_id, value, period_start, report_seq)
		VALUES ($1, $2, $3, jsonb_build_object('type', 'number', 'value', $4::numeric, 'event_count', $5::int), '2027-02-01', $5)`,
		ref.EntitlementID, ref.InstanceID, ref.OrganizationID, counter, counterSeq)
	require.NoError(t, err)
	return ref
}

func writeJournalRow(t *testing.T, ref ports.UsageRef, licenseID uuid.UUID, r journalRow) {
	t.Helper()
	windowStart, err := time.Parse("2006-01", r.window)
	require.NoError(t, err)
	_, err = testDb.DbPool.Exec(t.Context(), `
		INSERT INTO usage_ledger (organization_id, instance_id, entitlement_id, license_id, report_seq, reported_at,
		                          window_start, window_end, behavior, aggregation_method, reported_value, value_before,
		                          value_after, event_count_after, limit_value, overage_percent)
		VALUES ($1, $2, $3, $4, $5, $6::timestamp, $7, $8, $9, 'SUM', $10::numeric, $11::numeric, $12::numeric, 1, $13::numeric, $14)`,
		ref.OrganizationID, ref.InstanceID, ref.EntitlementID, licenseID, r.seq, r.reportedAt,
		windowStart, windowStart.AddDate(0, 1, 0), r.behavior, r.sent, r.before, r.after, r.limit, r.overagePercent)
	require.NoError(t, err)
}

func exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	_, err := testDb.DbPool.Exec(t.Context(), sql, args...)
	require.NoError(t, err)
}

func source() *billableusage.Source {
	return billableusage.New(testDb.DbPool, uow.NewUnitOfWork(testDb.DbPool), usageledger.Retention{})
}

func TestUsageSourceSummarize(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	ref := journalPair(t, exampleJournal, "181500", 45)

	summary, err := source().Summarize(t.Context(), ref, periodFrom, periodTo)
	require.NoError(t, err)

	// Reports 41-42 fall in the January window, 43-44 in February; 40 is
	// before the period and 45 is on its end, which belongs to the next one.
	require.Len(t, summary.Windows, 2)
	jan, feb := summary.Windows[0], summary.Windows[1]
	require.Equal(t, "-13000", jan.Usage.String())
	require.Equal(t, "-13000", jan.Overage.String())
	require.Equal(t, [3]int64{2, 41, 42}, [3]int64{jan.Rows, jan.FirstSeq, jan.LastSeq})
	require.Equal(t, "180500", feb.Usage.String())
	require.Equal(t, "30500", feb.Overage.String())
	require.Equal(t, [3]int64{2, 43, 44}, [3]int64{feb.Rows, feb.FirstSeq, feb.LastSeq})

	require.Len(t, summary.Limits, 2)
	require.Equal(t, "100000", summary.Limits[0].Limit.String())
	require.EqualValues(t, 3, summary.Limits[0].Rows)
	require.Equal(t, "150000", summary.Limits[1].Limit.String())
	require.EqualValues(t, 1, summary.Limits[1].Rows)

	fp := summary.Fingerprint
	require.EqualValues(t, 41, *fp.FirstSeq)
	require.EqualValues(t, 44, *fp.LastSeq)
	require.EqualValues(t, 4, fp.Rows)
	require.Equal(t, "167500", fp.SumDelta.String())
	require.Equal(t, "17500", fp.SumOverage.String())

	// Floored per window: January's downward set counts as 0.
	measure := metering.Measure(summary)
	require.Equal(t, "180500", measure.Usage.String())
	require.Equal(t, "30500", measure.Overage.String())
	require.Equal(t, 1, measure.NegativeSegmentsFloored)
	require.False(t, measure.Unlimited)

	composition, err := rating.Compose(rating.Input{
		Kind: rating.KindFinal, Currency: "EUR", LicenseName: "Pro",
		Base: rating.Price{
			ID: uuid.New(), BillingModel: rating.ModelFlatFee, BillingTiming: rating.TimingAdvance,
			UnitAmountDecimal: decimal.NewFromInt(2900), DisplayLabel: "", DisplayOrder: 0, Meter: nil,
		},
		Metered: []rating.Price{{
			ID: uuid.New(), BillingModel: rating.ModelOverage, BillingTiming: rating.TimingArrears,
			UnitAmountDecimal: decimal.NewFromInt(800), DisplayLabel: "", DisplayOrder: 0,
			Meter: &rating.Meter{
				EntitlementID: ref.EntitlementID, EntitlementSlug: "tokens", EntitlementName: "Tokens",
				SaleUnitFactor: decimal.NewFromInt(10000), SaleUnit: "10k tokens",
			},
		}},
		Measures: map[uuid.UUID]rating.Measure{ref.EntitlementID: measure},
		Advance:  rating.Period{From: periodTo, To: periodTo.AddDate(0, 1, 0)},
		Arrears:  rating.Period{From: periodFrom, To: periodTo},
	})
	require.NoError(t, err)
	require.Len(t, composition.Lines, 1)
	line := composition.Lines[0]
	require.Equal(t, "3.05", line.Quantity)
	require.EqualValues(t, 2440, line.Amount)
	require.Equal(t, 1, line.Metering.NegativeSegmentsFloored)
	require.Equal(t, "17500", *line.Metering.Ledger.SumOverage)
	require.Contains(t, line.Description, "(100,000 → 150,000)")
	require.Contains(t, line.Description, "corrections below 0 not credited")
}

func TestUsageSourceInvariants(t *testing.T) {
	check := func(t *testing.T, ref ports.UsageRef, prev *ports.Fingerprint) []ports.InvariantFailure {
		t.Helper()
		failures, err := source().CheckInvariants(t.Context(), ref, periodFrom, periodTo, prev)
		require.NoError(t, err)
		return failures
	}
	invariants := func(failures []ports.InvariantFailure) []ports.Invariant {
		var out []ports.Invariant
		for _, f := range failures {
			out = append(out, f.Invariant)
		}
		return out
	}

	t.Run("AnIntactJournal_PassesAll", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ref := journalPair(t, exampleJournal, "181500", 45)
		require.Empty(t, check(t, ref, nil))
		last := int64(40)
		require.Empty(t, check(t, ref, &ports.Fingerprint{FirstSeq: nil, LastSeq: &last, Rows: 0, SumDelta: decimal.Zero, SumOverage: decimal.Zero}),
			"the period starts right after the previous invoice's last report")
	})

	t.Run("AMissingReport_IsASequenceGap", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ref := journalPair(t, exampleJournal, "181500", 45)
		exec(t, `DELETE FROM usage_ledger WHERE instance_id = $1 AND report_seq = 43`, ref.InstanceID)
		failures := check(t, ref, nil)
		require.Equal(t, []ports.Invariant{ports.InvariantSequenceGap}, invariants(failures))
		require.EqualValues(t, 45, *failures[0].CounterReportSeq)
	})

	t.Run("APeriodNotStartingAfterThePreviousInvoice_IsASequenceGap", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ref := journalPair(t, exampleJournal, "181500", 45)
		last := int64(38)
		require.Equal(t, []ports.Invariant{ports.InvariantSequenceGap},
			invariants(check(t, ref, &ports.Fingerprint{FirstSeq: nil, LastSeq: &last, Rows: 0, SumDelta: decimal.Zero, SumOverage: decimal.Zero})))
	})

	t.Run("APurgedPredecessor_IsNoGap_WhileAMissingOneIs", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ref := journalPair(t, exampleJournal, "181500", 45)
		exec(t, `DELETE FROM usage_ledger WHERE instance_id = $1 AND report_seq = 40`, ref.InstanceID)
		require.Empty(t, check(t, ref, nil), "nothing older remains: retention took it")

		version := uuid.New()
		writeJournalRow(t, ref, version, journalRow{30, "2027-01-02 00:00:00", "append", "1", "0", "1", "2027-01", "100000", 50})
		require.Equal(t, []ports.Invariant{ports.InvariantSequenceGap}, invariants(check(t, ref, nil)))
	})

	t.Run("ARowNotStartingWhereThePreviousEnded_IsAChainBreak", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ref := journalPair(t, exampleJournal, "181500", 45)
		exec(t, `UPDATE usage_ledger SET value_before = 59000 WHERE instance_id = $1 AND report_seq = 44`, ref.InstanceID)
		require.Equal(t, []ports.Invariant{ports.InvariantChainBreak}, invariants(check(t, ref, nil)))
	})

	t.Run("AWindowNotStartingAt0_IsAChainBreak", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ref := journalPair(t, exampleJournal, "181500", 45)
		exec(t, `UPDATE usage_ledger SET value_before = 5, value_after = 60005 WHERE instance_id = $1 AND report_seq = 43`, ref.InstanceID)
		exec(t, `UPDATE usage_ledger SET value_before = 60005, value_after = 180505 WHERE instance_id = $1 AND report_seq = 44`, ref.InstanceID)
		exec(t, `UPDATE usage_ledger SET value_before = 180505, value_after = 181505 WHERE instance_id = $1 AND report_seq = 45`, ref.InstanceID)
		exec(t, `UPDATE entitlement_usage SET value = jsonb_set(value, '{value}', '181505') WHERE instance_id = $1`, ref.InstanceID)
		failures := check(t, ref, nil)
		require.Equal(t, []ports.Invariant{ports.InvariantChainBreak}, invariants(failures))
		require.Contains(t, failures[0].Expected, "report 43")
	})

	t.Run("ACounterAheadOfItsJournal_IsAMismatch", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ref := journalPair(t, exampleJournal, "181999", 45)
		failures := check(t, ref, nil)
		require.Equal(t, []ports.Invariant{ports.InvariantCounterMismatch}, invariants(failures))
		require.Contains(t, failures[0].Found, "181999")
	})

	t.Run("ACounterInAnotherWindow_IsNotCompared", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ref := journalPair(t, exampleJournal, "0", 45)
		exec(t, `UPDATE entitlement_usage SET period_start = '2027-03-01' WHERE instance_id = $1`, ref.InstanceID)
		require.Empty(t, check(t, ref, nil), "a rejected report rolled the counter over without a journal row")
	})

	t.Run("AnEmptyPeriod_ChecksOnlyTheCounter", func(t *testing.T) {
		t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
		ref := journalPair(t, exampleJournal[4:], "181999", 45)
		failures, err := source().CheckInvariants(t.Context(), ref, periodTo.AddDate(0, 1, 0), periodTo.AddDate(0, 2, 0), nil)
		require.NoError(t, err)
		require.Equal(t, []ports.Invariant{ports.InvariantCounterMismatch}, invariants(failures))
	})
}

func TestUsageSourceSeal(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	ref := journalPair(t, exampleJournal, "181500", 45)

	mark, err := source().Seal(t.Context(), ref, time.Now().UTC().Add(-time.Second))
	require.NoError(t, err)
	require.EqualValues(t, 45, mark.ReportSeq)
	require.WithinDuration(t, time.Now(), mark.SealedAt, time.Minute)

	_, err = source().Seal(t.Context(), ref, time.Now().UTC().Add(time.Hour))
	require.ErrorIs(t, err, ports.ErrClockBehind)

	unknown := ports.UsageRef{OrganizationID: ref.OrganizationID, InstanceID: uuid.New(), EntitlementID: uuid.New()}
	mark, err = source().Seal(t.Context(), unknown, time.Now().UTC().Add(-time.Second))
	require.NoError(t, err)
	require.Zero(t, mark.ReportSeq, fmt.Sprintf("a pair with no report seals at 0, got %d", mark.ReportSeq))
}

// The journal the usage report itself writes passes the invariants, and
// summarizes to the counter's movement.
func TestUsageSourceOverReportedUsage(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	tokens := newEntitlement(t, "tokens", 0)
	version := newVersion(t, "Pro", licenseschema.Published)
	grant(t, version.Slug, "tokens", 100000, 50)
	customer := newCustomer(t, "acme")
	instance := newInstance(t, "Acme prod", customer.ID, version.ID)
	from := time.Now().UTC().Add(-time.Minute)

	for _, report := range []map[string]any{
		{"value": map[string]any{"type": "number", "value": 5}, "behavior": "append"},
		{"value": map[string]any{"type": "number", "value": 7.5}, "behavior": "append"},
		{"value": map[string]any{"type": "number", "value": 3}, "behavior": "set"},
		{"value": map[string]any{"type": "number", "value": 0.25}, "behavior": "append"},
	} {
		resp := call(t, "POST", "/api/instances/"+instance.Slug+"/entitlements/tokens/usage", report)
		require.Less(t, resp.StatusCode, 300)
	}

	ref := ports.UsageRef{OrganizationID: testDb.DefaultData.OrganizationID, InstanceID: instance.ID, EntitlementID: tokens}
	_, err := source().Seal(t.Context(), ref, time.Now().UTC().Add(-time.Millisecond))
	require.NoError(t, err)
	to := time.Now().UTC().Add(time.Second)

	summary, err := source().Summarize(t.Context(), ref, from, to)
	require.NoError(t, err)
	require.Len(t, summary.Windows, 1)
	require.Equal(t, "3.25", summary.Windows[0].Usage.String(), "0 → 5 → 12.5 → 3 → 3.25")
	require.EqualValues(t, 4, summary.Fingerprint.Rows)
	require.EqualValues(t, 1, *summary.Fingerprint.FirstSeq)

	failures, err := source().CheckInvariants(t.Context(), ref, from, to, nil)
	require.NoError(t, err)
	require.Empty(t, failures)
}
