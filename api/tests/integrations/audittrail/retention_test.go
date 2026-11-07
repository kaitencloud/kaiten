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
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/auditretention"
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
type fakeRetention struct {
	mu     sync.Mutex
	values map[uuid.UUID]json.RawMessage
	errs   map[uuid.UUID]error
}

func (f *fakeRetention) ConfigValue(_ context.Context, organizationID uuid.UUID, slug string) (json.RawMessage, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if slug != "audit-retention" {
		return nil, fmt.Errorf("unexpected entitlement %q", slug)
	}
	if err := f.errs[organizationID]; err != nil {
		return nil, err
	}
	return f.values[organizationID], nil
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
