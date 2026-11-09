package audittrail_test

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
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/auditretention"
	auditdb "github.com/kaitencloud/kaiten/api/internal/modules/audittrail/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/listfororganization"
	notificationsdb "github.com/kaitencloud/kaiten/api/internal/modules/notifications/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/tests"
)

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

// fakeRetention answers each organization's audit-retention from a map: a
// JSON value, an error, or nil (the licence does not grant it) when absent.
// cached, when set, is what the tolerant ConfigValue answers instead: a value
// the live licence no longer states.
type fakeRetention struct {
	mu     sync.Mutex
	values map[uuid.UUID]json.RawMessage
	errs   map[uuid.UUID]error
	cached map[uuid.UUID]json.RawMessage
	asked  []uuid.UUID
}

func (f *fakeRetention) LiveConfigValue(_ context.Context, organizationID uuid.UUID, slug string) (json.RawMessage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if slug != "audit-retention" {
		return nil, fmt.Errorf("unexpected entitlement %q", slug)
	}
	f.asked = append(f.asked, organizationID)
	if err := f.errs[organizationID]; err != nil {
		return nil, err
	}
	return f.values[organizationID], nil
}

func (f *fakeRetention) ConfigValue(ctx context.Context, organizationID uuid.UUID, slug string) (json.RawMessage, error) {
	f.mu.Lock()
	cached, ok := f.cached[organizationID]
	f.mu.Unlock()
	if ok {
		return cached, nil
	}
	return f.LiveConfigValue(ctx, organizationID, slug)
}

func newJob(reader services.EntitlementConfig, days int, batch int32) *auditretention.Job {
	return auditretention.New(testDb.DbPool, reader, auditretention.Config{
		Interval:  time.Hour,
		BatchSize: batch,
		Settings:  auditretention.Settings{RetentionDays: days},
	})
}

func newOrganization(t *testing.T) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := testDb.DbPool.Exec(t.Context(),
		`INSERT INTO organization (id, external_id, name) VALUES ($1, $2, 'Audit retention test')`, id, id.String())
	require.NoError(t, err)
	return id
}

// insertEntry records one entry for organizationID at occurredAt and returns
// its id.
func insertEntry(t *testing.T, organizationID uuid.UUID, occurredAt time.Time) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(), `
		INSERT INTO audit_trail (organization_id, event_name, event_type, occurred_at, payload)
		VALUES ($1, 'CUSTOMER_CREATED', 'com.kaiten.customer.v1.created', $2, '{}'::jsonb)
		RETURNING id`, organizationID, occurredAt).Scan(&id))
	return id
}

func entriesOf(t *testing.T, organizationID uuid.UUID) []time.Time {
	t.Helper()
	rows, err := testDb.DbPool.Query(t.Context(),
		`SELECT occurred_at FROM audit_trail WHERE organization_id = $1 ORDER BY occurred_at`, organizationID)
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

// ages gives one instant per age in days, all counted from the same now, so an
// expectation names the very instant that was inserted.
func ages() func(days int) time.Time {
	now := time.Now().UTC().Truncate(time.Millisecond)
	return func(days int) time.Time { return now.AddDate(0, 0, -days) }
}

func TestSweepPurgesEachOrganizationToItsLicensedWindow(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	thirty, year := newOrganization(t), newOrganization(t)
	for _, org := range []uuid.UUID{thirty, year} {
		for _, age := range []int{400, 45, 31, 29, 1} {
			insertEntry(t, org, ago(age))
		}
	}
	reader := &fakeRetention{values: map[uuid.UUID]json.RawMessage{
		thirty: json.RawMessage(`{"days": 30}`),
		year:   json.RawMessage(`{"days": 365}`),
	}}

	require.NoError(t, newJob(reader, 0, 0).Sweep(t.Context()))

	require.Equal(t, []time.Time{ago(29), ago(1)}, entriesOf(t, thirty))
	require.Equal(t, []time.Time{ago(45), ago(31), ago(29), ago(1)}, entriesOf(t, year))
}

func TestSweepDrainsALargeBacklogInBatches(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	org := newOrganization(t)
	for i := range 25 {
		insertEntry(t, org, ago(100+i))
	}
	insertEntry(t, org, ago(2))
	reader := &fakeRetention{values: map[uuid.UUID]json.RawMessage{org: json.RawMessage(`{"days": 7}`)}}

	require.NoError(t, newJob(reader, 0, 4).Sweep(t.Context()))

	require.Equal(t, []time.Time{ago(2)}, entriesOf(t, org))
}

func TestSweepWithoutLicensingAuthorityKeepsEverythingByDefault(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	org := newOrganization(t)
	for _, age := range []int{4000, 400, 40} {
		insertEntry(t, org, ago(age))
	}

	require.NoError(t, newJob(services.NoLicensingAuthority{}, 0, 0).Sweep(t.Context()))

	require.Len(t, entriesOf(t, org), 3)
}

func TestSweepWithoutLicensingAuthorityAppliesTheConfiguredDays(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	org := newOrganization(t)
	for _, age := range []int{400, 40, 4} {
		insertEntry(t, org, ago(age))
	}

	require.NoError(t, newJob(services.NoLicensingAuthority{}, 30, 0).Sweep(t.Context()))

	require.Equal(t, []time.Time{ago(4)}, entriesOf(t, org))
}

func TestSweepKeepsAnOrganizationWhoseRetentionIsUnknown(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	failing, ungranted, malformed, fine := newOrganization(t), newOrganization(t), newOrganization(t), newOrganization(t)
	for _, org := range []uuid.UUID{failing, ungranted, malformed, fine} {
		insertEntry(t, org, ago(400))
	}
	reader := &fakeRetention{
		values: map[uuid.UUID]json.RawMessage{
			malformed: json.RawMessage(`{"days": "a while"}`),
			fine:      json.RawMessage(`{"days": 30}`),
		},
		errs: map[uuid.UUID]error{failing: errors.New("licensing authority unavailable")},
	}

	require.NoError(t, newJob(reader, 30, 0).Sweep(t.Context()))

	require.Len(t, entriesOf(t, failing), 1, "an error must keep the entries")
	require.Len(t, entriesOf(t, ungranted), 1, "a licence that does not grant the term must keep the entries")
	require.Len(t, entriesOf(t, malformed), 1, "a malformed term must keep the entries")
	require.Empty(t, entriesOf(t, fine))
}

func TestSweepRemovesTheReadMarkersWithTheEntry(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	org := newOrganization(t)
	expired := insertEntry(t, org, ago(400))
	kept := insertEntry(t, org, ago(1))
	for _, id := range []uuid.UUID{expired, kept} {
		_, err := testDb.DbPool.Exec(t.Context(),
			`INSERT INTO notification_read (user_id, audit_trail_id) VALUES ($1, $2)`, testDb.DefaultData.UserID, id)
		require.NoError(t, err)
	}
	reader := &fakeRetention{values: map[uuid.UUID]json.RawMessage{org: json.RawMessage(`{"days": 30}`)}}

	require.NoError(t, newJob(reader, 0, 0).Sweep(t.Context()))

	var markers int
	require.NoError(t, testDb.DbPool.QueryRow(t.Context(),
		`SELECT count(*) FROM notification_read WHERE audit_trail_id = ANY($1::uuid[])`, []uuid.UUID{expired, kept}).Scan(&markers))
	require.Equal(t, 1, markers, "the expired entry's marker goes with it, the kept entry's stays")
}

// insertBacklog records count entries for organizationID, all at occurredAt.
func insertBacklog(t *testing.T, organizationID uuid.UUID, occurredAt time.Time, count int) {
	t.Helper()
	_, err := testDb.DbPool.Exec(t.Context(), `
		INSERT INTO audit_trail (organization_id, event_name, event_type, occurred_at, payload)
		SELECT $1, 'CUSTOMER_CREATED', 'com.kaiten.customer.v1.created', $2, '{}'::jsonb
		FROM generate_series(1, $3::int)`, organizationID, occurredAt, count)
	require.NoError(t, err)
}

// The licence changed, or the authority went down after an older read: the
// tolerant read still answers the 30 days it remembers, and acting on it would
// delete entries the customer has paid to keep.
func TestSweepNeverDeletesOnARememberedWindow(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	upgraded, outage := newOrganization(t), newOrganization(t)
	for _, org := range []uuid.UUID{upgraded, outage} {
		insertEntry(t, org, ago(100))
	}
	stale := json.RawMessage(`{"days": 30}`)
	reader := &fakeRetention{
		values: map[uuid.UUID]json.RawMessage{upgraded: json.RawMessage(`{"days": 365}`)},
		errs:   map[uuid.UUID]error{outage: errors.New("licensing authority unavailable")},
		cached: map[uuid.UUID]json.RawMessage{upgraded: stale, outage: stale},
	}

	require.NoError(t, newJob(reader, 0, 0).Sweep(t.Context()))

	require.Len(t, entriesOf(t, upgraded), 1, "the live licence keeps a year")
	require.Len(t, entriesOf(t, outage), 1, "an outage keeps the entries, whatever was read before it")
}

// More than one turn's worth of batches, which a fixed per-organization cap
// would have left behind pass after pass.
func TestSweepDrainsABacklogLargerThanOneTurn(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	big, small := newOrganization(t), newOrganization(t)
	insertBacklog(t, big, ago(100), 130)
	insertEntry(t, big, ago(2))
	insertBacklog(t, small, ago(100), 3)
	reader := &fakeRetention{values: map[uuid.UUID]json.RawMessage{
		big:   json.RawMessage(`{"days": 7}`),
		small: json.RawMessage(`{"days": 7}`),
	}}

	require.NoError(t, newJob(reader, 0, 1).Sweep(t.Context()))

	require.Equal(t, []time.Time{ago(2)}, entriesOf(t, big))
	require.Empty(t, entriesOf(t, small))
	require.Equal(t, 2, countOf(reader.asked, big), "a window is read again for every turn")
}

func countOf(ids []uuid.UUID, id uuid.UUID) int {
	n := 0
	for _, candidate := range ids {
		if candidate == id {
			n++
		}
	}
	return n
}

func TestSweepStopsAtItsTimeBudget(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	org := newOrganization(t)
	insertEntry(t, org, ago(400))
	reader := &fakeRetention{values: map[uuid.UUID]json.RawMessage{org: json.RawMessage(`{"days": 30}`)}}

	job := auditretention.New(testDb.DbPool, reader, auditretention.Config{Interval: time.Hour, MaxPassDuration: time.Nanosecond})
	require.NoError(t, job.Sweep(t.Context()))

	require.Len(t, entriesOf(t, org), 1)
}

// A down authority costs a handful of timeouts, not one per organization.
func TestSweepStopsAskingAFailingAuthority(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	failure := errors.New("licensing authority unavailable")
	reader := &fakeRetention{errs: map[uuid.UUID]error{}}
	organizations := make([]uuid.UUID, 0, 9)
	for range 9 {
		org := newOrganization(t)
		insertEntry(t, org, ago(400))
		reader.errs[org] = failure
		organizations = append(organizations, org)
	}

	require.NoError(t, newJob(reader, 0, 0).Sweep(t.Context()))

	require.Len(t, reader.asked, 5)
	for _, org := range organizations {
		require.Len(t, entriesOf(t, org), 1)
	}
}

func TestSweepDoesNotLookUpAnOrganizationWithNothingToExpire(t *testing.T) {
	require.NoError(t, testDb.Reset())
	empty, fresh := newOrganization(t), newOrganization(t)
	insertEntry(t, fresh, time.Now().UTC().Add(-time.Hour))
	reader := &fakeRetention{}

	require.NoError(t, newJob(reader, 0, 0).Sweep(t.Context()))

	require.NotContains(t, reader.asked, empty)
	require.NotContains(t, reader.asked, fresh)
}

// A pass does not hold a connection of the pool while it waits on the licensing
// authority: requests compete for that pool.
func TestSweepHoldsNoPoolConnectionDuringALookup(t *testing.T) {
	require.NoError(t, testDb.Reset())
	org := newOrganization(t)
	insertEntry(t, org, ages()(400))

	var acquiredDuringLookup int32 = -1
	reader := lookupHook{before: func() { acquiredDuringLookup = testDb.DbPool.Stat().AcquiredConns() }}
	require.NoError(t, newJob(reader, 0, 0).Sweep(t.Context()))

	require.Zero(t, acquiredDuringLookup)
}

type lookupHook struct{ before func() }

func (h lookupHook) ConfigValue(context.Context, uuid.UUID, string) (json.RawMessage, error) {
	return nil, nil
}

func (h lookupHook) LiveConfigValue(context.Context, uuid.UUID, string) (json.RawMessage, error) {
	h.before()
	return nil, nil
}

// A lock timeout is retried next pass, and is not a failure of this one.
func TestSweepSurvivesALockedReadMarker(t *testing.T) {
	require.NoError(t, testDb.Reset())
	org := newOrganization(t)
	expired := insertEntry(t, org, ages()(400))
	_, err := testDb.DbPool.Exec(t.Context(),
		`INSERT INTO notification_read (user_id, audit_trail_id) VALUES ($1, $2)`, testDb.DefaultData.UserID, expired)
	require.NoError(t, err)
	reader := &fakeRetention{values: map[uuid.UUID]json.RawMessage{org: json.RawMessage(`{"days": 30}`)}}

	blocker, err := testDb.DbPool.Begin(t.Context())
	require.NoError(t, err)
	defer func() { _ = blocker.Rollback(context.WithoutCancel(t.Context())) }()
	_, err = blocker.Exec(t.Context(), `SELECT 1 FROM notification_read WHERE audit_trail_id = $1 FOR UPDATE`, expired)
	require.NoError(t, err)

	job := newJob(reader, 0, 0)
	require.NoError(t, job.Sweep(t.Context()))
	require.Len(t, entriesOf(t, org), 1, "the batch gave up on the lock")

	require.NoError(t, blocker.Rollback(t.Context()))
	require.NoError(t, job.Sweep(t.Context()))
	require.Empty(t, entriesOf(t, org), "the next pass finishes it")
}

// An entry being purged matches nothing, like any id that does not exist: it
// neither waits on the purge nor fails on the foreign key once that commits.
func TestMarkReadSkipsAnEntryBeingPurged(t *testing.T) {
	require.NoError(t, testDb.Reset())
	org := newOrganization(t)
	entry := insertEntry(t, org, ages()(400))
	mark := func(pool *pgxpool.Pool) (int64, error) {
		ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
		defer cancel()
		return notificationsdb.New(pool).MarkNotificationsRead(ctx, notificationsdb.MarkNotificationsReadParams{
			UserID: testDb.DefaultData.UserID, Ids: []uuid.UUID{entry}, OrganizationID: org,
		})
	}

	purge, err := testDb.DbPool.Begin(t.Context())
	require.NoError(t, err)
	defer func() { _ = purge.Rollback(context.WithoutCancel(t.Context())) }()
	_, err = purge.Exec(t.Context(), `DELETE FROM audit_trail WHERE id = $1`, entry)
	require.NoError(t, err)

	marked, err := mark(testDb.DbPool)
	require.NoError(t, err)
	require.Zero(t, marked)

	require.NoError(t, purge.Rollback(t.Context()))
	marked, err = mark(testDb.DbPool)
	require.NoError(t, err)
	require.EqualValues(t, 1, marked, "the entry was not deleted after all, so it can be marked")
}

// Entries past the window are not served while the sweep has yet to reach them.
func TestListingStopsAtTheOrganizationsWindow(t *testing.T) {
	require.NoError(t, testDb.Reset())
	ago := ages()
	org := newOrganization(t)
	for _, age := range []int{400, 40, 4} {
		insertEntry(t, org, ago(age))
	}
	reader := &fakeRetention{values: map[uuid.UUID]json.RawMessage{org: json.RawMessage(`{"days": 30}`)}}
	retention := auditretention.NewRetention(reader, true, 0)

	useCase := listfororganization.NewUseCase(auditdb.New(testDb.DbPool), retention)

	for _, changesOnly := range []bool{false, true} {
		entries, err := useCase.Execute(t.Context(), org, nil, changesOnly, nil, nil, 10, nil)
		require.NoError(t, err)
		require.Len(t, entries, 1, "changesOnly=%v", changesOnly)
		require.Equal(t, ago(4), entries[0].OccurredAt.UTC())
	}
}
