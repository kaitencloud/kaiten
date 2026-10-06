package usageledger_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usageledger"
	"github.com/kaitencloud/kaiten/api/tests"
)

// These tests detach and drop usage_ledger partitions, so they run on a
// database of their own rather than the instances suite's shared one. Reset
// restores the migrated snapshot, partitions included.
var testDb *tests.TestDatabase

func TestMain(m *testing.M) {
	var err error
	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	code := m.Run()
	testDb.TearDown()
	os.Exit(code)
}

const idempotencyWindow = 840 * time.Hour

func defaultSettings() usageledger.Settings {
	return usageledger.Settings{RetentionMonths: 18, MaxRetentionMonths: 18, IdempotencyWindow: idempotencyWindow}
}

func newMaintenance(reader services.EntitlementConfig, settings usageledger.Settings, batch int32) *usageledger.Maintenance {
	return usageledger.New(testDb.DbPool, reader, usageledger.Config{
		Interval:       time.Hour,
		PurgeBatchSize: batch,
		Settings:       settings,
	})
}

// fakeRetention answers each organization's usage-history-retention from a map:
// a JSON value, an error, or nil (the licence does not grant it) when absent.
type fakeRetention struct {
	mu     sync.Mutex
	values map[uuid.UUID]json.RawMessage
	errs   map[uuid.UUID]error
	asked  []uuid.UUID
}

func (f *fakeRetention) ConfigValue(_ context.Context, organizationID uuid.UUID, slug string) (json.RawMessage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if slug != "usage-history-retention" {
		return nil, fmt.Errorf("unexpected entitlement %q", slug)
	}
	f.asked = append(f.asked, organizationID)
	if err := f.errs[organizationID]; err != nil {
		return nil, err
	}
	return f.values[organizationID], nil
}

func dbNow(t *testing.T) time.Time {
	t.Helper()
	var now time.Time
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)`).Scan(&now))
	return now.UTC()
}

func monthStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func partitionName(month time.Time) string {
	return fmt.Sprintf("usage_ledger_p%04d_%02d", month.Year(), int(month.Month()))
}

// monthOffset is the start of the month k months from now's (k < 0 is past).
func monthOffset(now time.Time, k int) time.Time {
	return period.AddMonths(monthStart(now), k)
}

func attachedPartitions(t *testing.T) map[string]bool {
	t.Helper()
	rows, err := testDb.DbPool.Query(t.Context(), `
		SELECT c.relname::text FROM pg_catalog.pg_inherits i
		JOIN pg_catalog.pg_class c ON c.oid = i.inhrelid
		WHERE i.inhparent = 'usage_ledger'::regclass`)
	require.NoError(t, err)
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var name string
		require.NoError(t, rows.Scan(&name))
		out[name] = true
	}
	require.NoError(t, rows.Err())
	return out
}

func tableExists(t *testing.T, name string) bool {
	t.Helper()
	var exists bool
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT to_regclass($1) IS NOT NULL`, name).Scan(&exists))
	return exists
}

func createPartition(t *testing.T, month time.Time) {
	t.Helper()
	_, err := testDb.DbPool.Exec(t.Context(), fmt.Sprintf(
		`CREATE TABLE IF NOT EXISTS %q PARTITION OF usage_ledger FOR VALUES FROM ('%s') TO ('%s')`,
		partitionName(month), month.Format(time.DateTime), period.AddMonths(month, 1).Format(time.DateTime)))
	require.NoError(t, err)
}

func dropPartition(t *testing.T, month time.Time) {
	t.Helper()
	name := partitionName(month)
	_, err := testDb.DbPool.Exec(t.Context(), fmt.Sprintf(`ALTER TABLE usage_ledger DETACH PARTITION %q`, name))
	require.NoError(t, err)
	_, err = testDb.DbPool.Exec(t.Context(), fmt.Sprintf(`DROP TABLE %q`, name))
	require.NoError(t, err)
}

func newOrganization(t *testing.T) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := testDb.DbPool.Exec(t.Context(),
		`INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Usage ledger test')`, id, id.String())
	require.NoError(t, err)
	return id
}

// insertRow journals one report for organizationID at reportedAt, on a pair of
// its own.
func insertRow(t *testing.T, organizationID uuid.UUID, reportedAt time.Time) {
	t.Helper()
	_, err := testDb.DbPool.Exec(t.Context(), `
		INSERT INTO usage_ledger (organization_id, instance_id, entitlement_id, license_id, report_seq,
		                          reported_at, behavior, aggregation_method, reported_value, value_before,
		                          value_after, event_count_after, overage_percent)
		VALUES ($1, $2, $3, $4, 1, $5, 'append', 'SUM', 1, 0, 1, 1, -1)`,
		organizationID, uuid.New(), uuid.New(), uuid.New(), reportedAt)
	require.NoError(t, err)
}

func rowsOf(t *testing.T, organizationID uuid.UUID) []time.Time {
	t.Helper()
	rows, err := testDb.DbPool.Query(t.Context(),
		`SELECT reported_at FROM usage_ledger WHERE organization_id = $1 ORDER BY reported_at`, organizationID)
	require.NoError(t, err)
	defer rows.Close()
	var out []time.Time
	for rows.Next() {
		var at time.Time
		require.NoError(t, rows.Scan(&at))
		out = append(out, at.UTC())
	}
	require.NoError(t, rows.Err())
	return out
}

func TestEnsureReadyRecreatesMissingPartitions(t *testing.T) {
	require.NoError(t, testDb.Reset())
	now := dbNow(t)

	// The current month, the next one and the last of the runway, gone.
	current, next, last := monthOffset(now, 0), monthOffset(now, 1), monthOffset(now, 12)
	for _, month := range []time.Time{current, next, last} {
		dropPartition(t, month)
	}

	require.NoError(t, newMaintenance(nil, defaultSettings(), 0).EnsureReady(t.Context()))

	attached := attachedPartitions(t)
	for k := -1; k <= 12; k++ {
		require.True(t, attached[partitionName(monthOffset(now, k))], "month %+d has no partition", k)
	}
}

func TestEnsureReadyIsANoOpWhenEveryPartitionExists(t *testing.T) {
	require.NoError(t, testDb.Reset())
	before := attachedPartitions(t)

	m := newMaintenance(nil, defaultSettings(), 0)
	require.NoError(t, m.EnsureReady(t.Context()))
	require.NoError(t, m.EnsureReady(t.Context()))

	require.Equal(t, before, attachedPartitions(t))
}

func TestEnsureReadyRunsConcurrentlyOnEveryReplica(t *testing.T) {
	require.NoError(t, testDb.Reset())
	now := dbNow(t)
	for k := 1; k <= 12; k++ {
		dropPartition(t, monthOffset(now, k))
	}

	var wg sync.WaitGroup
	errs := make([]error, 4)
	for i := range errs {
		wg.Go(func() { errs[i] = newMaintenance(nil, defaultSettings(), 0).EnsureReady(t.Context()) })
	}
	wg.Wait()
	for _, err := range errs {
		require.NoError(t, err)
	}

	attached := attachedPartitions(t)
	for k := 1; k <= 12; k++ {
		require.True(t, attached[partitionName(monthOffset(now, k))], "month %+d has no partition", k)
	}
}

func TestSweepDropsPartitionsPastTheCeiling(t *testing.T) {
	require.NoError(t, testDb.Reset())
	now := dbNow(t)
	org := newOrganization(t)

	// With an 18-month ceiling, a month is dropped once it ENDED 18 months ago:
	// -20 and -19 have, -18 has not.
	for _, k := range []int{-20, -19, -18} {
		createPartition(t, monthOffset(now, k))
		insertRow(t, org, monthOffset(now, k).Add(time.Hour))
	}

	require.NoError(t, newMaintenance(nil, defaultSettings(), 0).Sweep(t.Context()))

	require.False(t, tableExists(t, partitionName(monthOffset(now, -20))))
	require.False(t, tableExists(t, partitionName(monthOffset(now, -19))))
	require.True(t, attachedPartitions(t)[partitionName(monthOffset(now, -18))])
	require.Equal(t, []time.Time{monthOffset(now, -18).Add(time.Hour)}, rowsOf(t, org))
}

func TestSweepKeepsEverythingWhenRetentionIsForever(t *testing.T) {
	require.NoError(t, testDb.Reset())
	now := dbNow(t)
	org := newOrganization(t)
	createPartition(t, monthOffset(now, -30))
	insertRow(t, org, monthOffset(now, -30))

	settings := usageledger.Settings{RetentionMonths: 0, MaxRetentionMonths: 18, IdempotencyWindow: idempotencyWindow}
	require.NoError(t, newMaintenance(nil, settings, 0).Sweep(t.Context()))

	require.True(t, attachedPartitions(t)[partitionName(monthOffset(now, -30))])
	require.Len(t, rowsOf(t, org), 1)
}

func TestSweepPurgesEachOrganizationToItsLicensedRetention(t *testing.T) {
	require.NoError(t, testDb.Reset())
	now := dbNow(t)
	for _, k := range []int{-6, -5, -4} {
		createPartition(t, monthOffset(now, k))
	}

	short := newOrganization(t)      // licensed 3 months
	long := newOrganization(t)       // licensed 24 months: above the ceiling, left to dropping
	unreadable := newOrganization(t) // the licensing authority errors
	ungranted := newOrganization(t)  // the licence does not grant the entitlement
	malformed := newOrganization(t)  // granted, but not {"months": N}

	old := monthOffset(now, -5).Add(time.Hour)
	recent := now.Add(-2 * 24 * time.Hour)
	for _, org := range []uuid.UUID{short, long, unreadable, ungranted, malformed} {
		// Five old rows, so a batch of 2 has to loop.
		for i := range 5 {
			insertRow(t, org, old.Add(time.Duration(i)*time.Minute))
		}
		insertRow(t, org, recent)
	}

	reader := &fakeRetention{
		values: map[uuid.UUID]json.RawMessage{
			short:     json.RawMessage(`{"months":3}`),
			long:      json.RawMessage(`{"months":24}`),
			malformed: json.RawMessage(`{"months":"3"}`),
		},
		errs: map[uuid.UUID]error{unreadable: errors.New("licensing deployment unreachable")},
	}
	require.NoError(t, newMaintenance(reader, defaultSettings(), 2).Sweep(t.Context()))

	require.Equal(t, []time.Time{recent}, rowsOf(t, short), "rows past 3 months are deleted")
	for name, org := range map[string]uuid.UUID{"long": long, "unreadable": unreadable, "ungranted": ungranted, "malformed": malformed} {
		require.Len(t, rowsOf(t, org), 6, "%s keeps every row", name)
	}
}

func TestSweepWithoutLicensingAuthorityAppliesTheConfiguredRetention(t *testing.T) {
	require.NoError(t, testDb.Reset())
	now := dbNow(t)
	createPartition(t, monthOffset(now, -4))
	a, b := newOrganization(t), newOrganization(t)
	old := monthOffset(now, -4).Add(time.Hour)
	for _, org := range []uuid.UUID{a, b} {
		insertRow(t, org, old)
		insertRow(t, org, now.Add(-time.Hour))
	}

	settings := usageledger.Settings{RetentionMonths: 3, MaxRetentionMonths: 18, IdempotencyWindow: idempotencyWindow}
	require.NoError(t, newMaintenance(nil, settings, 0).Sweep(t.Context()))

	require.Len(t, rowsOf(t, a), 1)
	require.Len(t, rowsOf(t, b), 1)
}

func TestSweepNeverPurgesInsideTheIdempotencyHorizon(t *testing.T) {
	require.NoError(t, testDb.Reset())
	now := dbNow(t)
	org := newOrganization(t)
	createPartition(t, monthOffset(now, -2))

	// One month of retention, but a 60-day horizon: a row 40 days old is past
	// the retention and still inside the horizon.
	insideHorizon := now.Add(-40 * 24 * time.Hour)
	pastHorizon := now.Add(-61 * 24 * time.Hour)
	createPartition(t, monthStart(pastHorizon))
	insertRow(t, org, insideHorizon)
	insertRow(t, org, pastHorizon)

	reader := &fakeRetention{values: map[uuid.UUID]json.RawMessage{org: json.RawMessage(`{"months":1}`)}}
	settings := defaultSettings()
	settings.IdempotencyWindow = 60 * 24 * time.Hour
	require.NoError(t, newMaintenance(reader, settings, 0).Sweep(t.Context()))

	require.Equal(t, []time.Time{insideHorizon}, rowsOf(t, org))
}

func TestSweepAlsoRestoresTheRunway(t *testing.T) {
	require.NoError(t, testDb.Reset())
	now := dbNow(t)
	dropPartition(t, monthOffset(now, 6))

	require.NoError(t, newMaintenance(nil, defaultSettings(), 0).Sweep(t.Context()))

	require.True(t, attachedPartitions(t)[partitionName(monthOffset(now, 6))])
}
