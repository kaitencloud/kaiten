package billing_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usageledger"
)

// D-33: the retention purge and the partition drop never delete usage that is
// not invoiced yet.
func TestUsageLedgerMaintenanceSparesUninvoicedUsage(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })
	s := meteredSold(t)
	started := subscribe(t, s.instance.Slug, map[string]any{"basePriceId": s.monthly.ID})
	reportTokens(t, s.instance.Slug, 1000)
	// The subscription has run for five months without a close.
	backdate(t, started.ID, 5)

	ago := func(months int) time.Time {
		return period.AddMonths(time.Now().UTC(), -months).Truncate(time.Millisecond)
	}
	// 12 months ago: older than the predecessor; 4 months ago: in the period.
	// The 2-month-old row falls between, before the period started.
	for i, months := range []int{20, 12, 4} {
		exec(t, fmt.Sprintf(`CREATE TABLE IF NOT EXISTS "usage_ledger_p%04d_%02d" PARTITION OF usage_ledger
		                       FOR VALUES FROM ('%s') TO ('%s')`,
			ago(months).Year(), int(ago(months).Month()),
			time.Date(ago(months).Year(), ago(months).Month(), 1, 0, 0, 0, 0, time.UTC).Format(time.DateTime),
			time.Date(ago(months).Year(), ago(months).Month()+1, 1, 0, 0, 0, 0, time.UTC).Format(time.DateTime)))
		exec(t, `INSERT INTO usage_ledger (organization_id, instance_id, entitlement_id, license_id, report_seq, reported_at,
		                                   behavior, aggregation_method, reported_value, value_before, value_after,
		                                   event_count_after, overage_percent, limit_value, window_start, window_end)
		         SELECT organization_id, instance_id, entitlement_id, license_id, report_seq + $2, $1::timestamp,
		                behavior, aggregation_method, reported_value, value_before, value_after, event_count_after, overage_percent, limit_value, window_start, window_end
		           FROM usage_ledger ORDER BY report_seq LIMIT 1`, ago(months), i+10)
	}

	maintenance := usageledger.New(testDb.DbPool, nil, usageledger.Config{
		Interval:       time.Hour,
		PurgeBatchSize: 100,
		// Three months of history, and a ceiling above every row: the
		// per-organization DELETE applies.
		Settings: usageledger.Settings{RetentionMonths: 3, MaxRetentionMonths: 36, IdempotencyWindow: 840 * time.Hour},
	})
	require.NoError(t, maintenance.Sweep(t.Context()))

	var months []int
	rows, err := testDb.DbPool.Query(t.Context(), `
		SELECT round(extract(epoch FROM (now() AT TIME ZONE 'UTC') - reported_at) / (86400 * 30))::int
		  FROM usage_ledger ORDER BY reported_at`)
	require.NoError(t, err)
	defer rows.Close()
	for rows.Next() {
		var m int
		require.NoError(t, rows.Scan(&m))
		months = append(months, m)
	}
	require.NoError(t, rows.Err())
	// 20 and 12 months old: the 12-month-old row is the last one before the
	// period started (five months ago), so it stays; the 20-month-old one goes.
	require.Len(t, months, 3, "the 20-month-old row is purged; the predecessor, the period's row and today's stay")
	require.NotContains(t, months, 20)

	// With the ceiling at 18 months the 20-month-old partition is dropped, but
	// one that still holds the predecessor row is not.
	exec(t, `UPDATE usage_ledger SET reported_at = $1::timestamp WHERE reported_at < $2::timestamp`, ago(20), ago(10))
	maintenance = usageledger.New(testDb.DbPool, nil, usageledger.Config{
		Interval: time.Hour, PurgeBatchSize: 100,
		Settings: usageledger.Settings{RetentionMonths: 18, MaxRetentionMonths: 18, IdempotencyWindow: 840 * time.Hour},
	})
	require.NoError(t, maintenance.Sweep(t.Context()))
	var kept int
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(), `SELECT count(*) FROM usage_ledger WHERE reported_at < $1::timestamp`, ago(18)).Scan(&kept))
	require.Equal(t, 1, kept, "the predecessor row, past the ceiling, keeps its partition")
}
