package retention_test

import (
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/retention"
	"github.com/kaitencloud/kaiten/api/tests"
)

var testDb *tests.TestDatabase

func TestMain(m *testing.M) {
	var err error
	testDb, err = tests.NewTestDatabase()
	if err != nil {
		panic("failed to setup test database: " + err.Error())
	}
	defer testDb.TearDown()
	os.Exit(m.Run())
}

func insertOutboxEvent(t *testing.T, pool *pgxpool.Pool, orgID uuid.UUID, occurredAt time.Time) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(t.Context(),
		`INSERT INTO outbox_events (organization_id, event_name, event_type, occurred_at, data)
		 VALUES ($1, 'TEST', '1.0', $2, '{}'::jsonb) RETURNING id`,
		orgID, occurredAt).Scan(&id)
	require.NoError(t, err)
	return id
}

func insertInboxEvent(t *testing.T, pool *pgxpool.Pool, orgID uuid.UUID, messageID string, processedAt time.Time) uuid.UUID {
	t.Helper()
	var id uuid.UUID
	err := pool.QueryRow(t.Context(),
		`INSERT INTO inbox_events (organization_id, source, message_id, consumer, processed_at)
		 VALUES ($1, 'test', $2, 'test-consumer', $3) RETURNING id`,
		orgID, messageID, processedAt).Scan(&id)
	require.NoError(t, err)
	return id
}

func rowExists(t *testing.T, pool *pgxpool.Pool, table string, id uuid.UUID) bool {
	t.Helper()
	var exists bool
	err := pool.QueryRow(t.Context(),
		`SELECT EXISTS (SELECT 1 FROM `+table+` WHERE id = $1)`, id).Scan(&exists)
	require.NoError(t, err)
	return exists
}

func TestSweepPurgesOnlyRowsOlderThanSevenDays(t *testing.T) {
	require.NoError(t, testDb.Reset())

	pool := testDb.DbPool
	orgID := testDb.DefaultData.OrganizationID
	now := time.Now().UTC()
	staleOutbox := insertOutboxEvent(t, pool, orgID, now.Add(-8*24*time.Hour))
	freshOutbox := insertOutboxEvent(t, pool, orgID, now.Add(-6*24*time.Hour))
	staleInbox := insertInboxEvent(t, pool, orgID, "stale", now.Add(-8*24*time.Hour))
	freshInbox := insertInboxEvent(t, pool, orgID, "fresh", now.Add(-6*24*time.Hour))

	job := retention.New(pool, retention.Config{
		Interval:           time.Hour,
		BatchSize:          100,
		OutboxEventsWindow: 7 * 24 * time.Hour,
		InboxEventsWindow:  7 * 24 * time.Hour,
	})
	require.NoError(t, job.Sweep(t.Context()))

	require.False(t, rowExists(t, pool, "outbox_events", staleOutbox))
	require.True(t, rowExists(t, pool, "outbox_events", freshOutbox))
	require.False(t, rowExists(t, pool, "inbox_events", staleInbox))
	require.True(t, rowExists(t, pool, "inbox_events", freshInbox))
}

func TestSweepSkipsDisabledTable(t *testing.T) {
	require.NoError(t, testDb.Reset())

	pool := testDb.DbPool
	orgID := testDb.DefaultData.OrganizationID
	ancient := time.Now().UTC().Add(-10 * 365 * 24 * time.Hour)
	outboxID := insertOutboxEvent(t, pool, orgID, ancient)
	inboxID := insertInboxEvent(t, pool, orgID, "ancient", ancient)

	job := retention.New(pool, retention.Config{
		Interval:           time.Hour,
		BatchSize:          100,
		OutboxEventsWindow: 0,
		InboxEventsWindow:  7 * 24 * time.Hour,
	})
	require.NoError(t, job.Sweep(t.Context()))

	require.True(t, rowExists(t, pool, "outbox_events", outboxID))
	require.False(t, rowExists(t, pool, "inbox_events", inboxID))
}

func TestSweepDrainsAcrossBatches(t *testing.T) {
	require.NoError(t, testDb.Reset())

	pool := testDb.DbPool
	orgID := testDb.DefaultData.OrganizationID
	stale := time.Now().UTC().Add(-8 * 24 * time.Hour)
	for i := range 25 {
		insertOutboxEvent(t, pool, orgID, stale.Add(time.Duration(i)*time.Second))
	}

	job := retention.New(pool, retention.Config{
		Interval:           time.Hour,
		BatchSize:          4,
		OutboxEventsWindow: 7 * 24 * time.Hour,
	})
	require.NoError(t, job.Sweep(t.Context()))

	var remaining int64
	err := pool.QueryRow(t.Context(),
		`SELECT count(*) FROM outbox_events WHERE occurred_at < now() - interval '7 days'`).Scan(&remaining)
	require.NoError(t, err)
	require.Zero(t, remaining)
}

func TestSweepLockIsExclusive(t *testing.T) {
	require.NoError(t, testDb.Reset())

	pool := testDb.DbPool
	orgID := testDb.DefaultData.OrganizationID
	ctx := t.Context()
	staleID := insertOutboxEvent(t, pool, orgID, time.Now().UTC().Add(-8*24*time.Hour))

	conn, err := pool.Acquire(ctx)
	require.NoError(t, err)
	defer conn.Release()

	const lockKey = int64(20260817010000)
	var locked bool
	require.NoError(t, conn.QueryRow(ctx, `SELECT pg_try_advisory_lock($1)`, lockKey).Scan(&locked))
	require.True(t, locked)

	job := retention.New(pool, retention.Config{
		Interval:           time.Hour,
		BatchSize:          100,
		OutboxEventsWindow: 7 * 24 * time.Hour,
	})
	require.NoError(t, job.Sweep(ctx))
	require.True(t, rowExists(t, pool, "outbox_events", staleID))

	var unlocked bool
	require.NoError(t, conn.QueryRow(ctx, `SELECT pg_advisory_unlock($1)`, lockKey).Scan(&unlocked))
	require.True(t, unlocked)
	require.NoError(t, job.Sweep(ctx))
	require.False(t, rowExists(t, pool, "outbox_events", staleID))
}
