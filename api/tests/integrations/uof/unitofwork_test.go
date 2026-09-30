package uof_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
)

// TestUnitOfWork_RecordEventInTransaction tests that events are recorded in the outbox table
// when using UnitOfWork within a transaction
func TestUnitOfWork_RecordEventInTransaction(t *testing.T) {
	ctx := context.Background()
	queries := outboxdb.New(testDb.DbPool)
	unitOfWork := uow.NewUnitOfWork(testDb.DbPool)

	// Test event data
	eventData := map[string]interface{}{
		"key1": "value1",
		"key2": 42,
		"nested": map[string]interface{}{
			"field": "nested_value",
		},
	}

	eventHeaders := map[string]interface{}{
		"trace_id": "test-trace-123",
		"source":   "integration-test",
	}

	// Create an outbox event within a transaction
	err := unitOfWork.Transact(ctx, func(ctx context.Context) error {
		txOutbox := outbox.NewOutboxRepository(outboxdb.New(unitOfWork.DBTX(ctx)))

		event := outbox.NewOutboxMessage(
			testDb.DefaultData.OrganizationID,
			"TEST_EVENT",
			"1.0",
			eventData,
			eventHeaders,
		)

		return txOutbox.CreateOutboxEvent(ctx, event)
	})

	require.NoError(t, err)

	events := eventsNamed(t, queries, "TEST_EVENT")
	require.Len(t, events, 1)

	persistedEvent := events[0]
	assert.Equal(t, testDb.DefaultData.OrganizationID, persistedEvent.OrganizationID)
	assert.Equal(t, "TEST_EVENT", persistedEvent.EventName)
	assert.Equal(t, "1.0", persistedEvent.EventType)

	// Verify event data
	var actualData map[string]interface{}
	err = json.Unmarshal(persistedEvent.Data, &actualData)
	require.NoError(t, err)
	assert.Equal(t, "value1", actualData["key1"])
	assert.Equal(t, float64(42), actualData["key2"]) // JSON unmarshals numbers as float64

	nested, ok := actualData["nested"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, "nested_value", nested["field"])

	// Verify event headers
	var actualHeaders map[string]interface{}
	err = json.Unmarshal(persistedEvent.Headers, &actualHeaders)
	require.NoError(t, err)
	assert.Equal(t, "test-trace-123", actualHeaders["trace_id"])
	assert.Equal(t, "integration-test", actualHeaders["source"])
}

// TestUnitOfWork_RollbackOnError tests that events are not persisted if transaction fails
func TestUnitOfWork_RollbackOnError(t *testing.T) {
	ctx := context.Background()
	queries := outboxdb.New(testDb.DbPool)
	unitOfWork := uow.NewUnitOfWork(testDb.DbPool)

	// Get initial count
	eventsBefore, err := queries.ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	initialCount := len(eventsBefore)

	// Create an outbox event within a transaction that will fail
	err = unitOfWork.Transact(ctx, func(ctx context.Context) error {
		txOutbox := outbox.NewOutboxRepository(outboxdb.New(unitOfWork.DBTX(ctx)))

		event := outbox.NewOutboxMessage(
			testDb.DefaultData.OrganizationID,
			"TEST_EVENT_ROLLBACK",
			"1.0",
			map[string]string{"test": "data"},
			nil,
		)

		if err := txOutbox.CreateOutboxEvent(ctx, event); err != nil {
			return err
		}

		// Force an error to trigger rollback
		return assert.AnError
	})

	require.Error(t, err)
	assert.Equal(t, assert.AnError, err)

	// Verify the event was NOT persisted (transaction was rolled back)
	eventsAfter, err := queries.ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	assert.Equal(t, initialCount, len(eventsAfter))
}

// TestUnitOfWork_RollbackRunsOnACancelledContext covers the case the deferred
// rollback exists for in the first place: the request context died, so
// Transact is unwinding on the very context it would otherwise issue the
// ROLLBACK on.
//
// The assertion is the backend pid rather than the absent row, because both
// the correct and the incorrect behaviour end with the row absent. What
// differs is the connection: pgx returns "context already done" without
// writing anything to the socket, so the transaction is still open when
// pgxpool.Conn.Release inspects it, and a connection whose TxStatus is not
// 'I' gets destroyed instead of returned to the pool. With MaxConns=1 the
// next acquire therefore hands back either the same backend (rollback ran)
// or a brand new one (rollback was skipped and the connection was thrown
// away) -- which is the cost this pays during a cancellation storm, when
// connections are already scarce.
func TestUnitOfWork_RollbackRunsOnACancelledContext(t *testing.T) {
	config := testDb.DbPool.Config()
	config.MaxConns = 1
	config.MinConns = 0

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	require.NoError(t, err)
	defer pool.Close()

	var pidBefore uint32
	require.NoError(t, pool.QueryRow(context.Background(), "SELECT pg_backend_pid()").Scan(&pidBefore))

	unitOfWork := uow.NewUnitOfWork(pool)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	err = unitOfWork.Transact(ctx, func(ctx context.Context) error {
		txOutbox := outbox.NewOutboxRepository(outboxdb.New(unitOfWork.DBTX(ctx)))

		event := outbox.NewOutboxMessage(
			testDb.DefaultData.OrganizationID,
			"TEST_EVENT_CANCELLED",
			"1.0",
			map[string]string{"test": "data"},
			nil,
		)
		if err := txOutbox.CreateOutboxEvent(ctx, event); err != nil {
			return err
		}

		// The caller goes away mid-transaction: from here on, including the
		// deferred rollback, ctx is dead.
		cancel()
		return ctx.Err()
	})
	require.ErrorIs(t, err, context.Canceled)

	var pidAfter uint32
	require.NoError(t, pool.QueryRow(context.Background(), "SELECT pg_backend_pid()").Scan(&pidAfter))
	assert.Equal(t, pidBefore, pidAfter,
		"the connection was destroyed instead of reused: the rollback did not run, so the transaction was still open when the connection went back to the pool")

	events, err := outboxdb.New(testDb.DbPool).ListOutboxEvents(context.Background(), testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	for _, event := range events {
		assert.NotEqual(t, "TEST_EVENT_CANCELLED", event.EventName, "the cancelled transaction must not have committed")
	}
}

// TestUnitOfWork_MultipleEventsInSingleTransaction tests recording multiple events
func TestUnitOfWork_MultipleEventsInSingleTransaction(t *testing.T) {
	ctx := context.Background()
	queries := outboxdb.New(testDb.DbPool)
	unitOfWork := uow.NewUnitOfWork(testDb.DbPool)

	// Get initial count
	eventsBefore, err := queries.ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	initialCount := len(eventsBefore)

	// Create multiple events within a single transaction
	err = unitOfWork.Transact(ctx, func(ctx context.Context) error {
		txOutbox := outbox.NewOutboxRepository(outboxdb.New(unitOfWork.DBTX(ctx)))

		// First event
		event1 := outbox.NewOutboxMessage(
			testDb.DefaultData.OrganizationID,
			"FIRST_EVENT",
			"1.0",
			map[string]string{"order": "1"},
			nil,
		)
		if err := txOutbox.CreateOutboxEvent(ctx, event1); err != nil {
			return err
		}

		// Second event
		event2 := outbox.NewOutboxMessage(
			testDb.DefaultData.OrganizationID,
			"SECOND_EVENT",
			"1.0",
			map[string]string{"order": "2"},
			nil,
		)
		if err := txOutbox.CreateOutboxEvent(ctx, event2); err != nil {
			return err
		}

		// Third event
		event3 := outbox.NewOutboxMessage(
			testDb.DefaultData.OrganizationID,
			"THIRD_EVENT",
			"1.0",
			map[string]string{"order": "3"},
			nil,
		)
		return txOutbox.CreateOutboxEvent(ctx, event3)
	})

	require.NoError(t, err)

	eventsAfter, err := queries.ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	assert.Equal(t, initialCount+3, len(eventsAfter), "all three writes commit together or none do")

	eventNames := make([]string, 0, 3)
	for _, row := range eventsNamed(t, queries, "FIRST_EVENT", "SECOND_EVENT", "THIRD_EVENT") {
		eventNames = append(eventNames, row.EventName)
	}

	assert.ElementsMatch(t, []string{"FIRST_EVENT", "SECOND_EVENT", "THIRD_EVENT"}, eventNames)
}

func TestUnitOfWork_EventWithoutHeaders(t *testing.T) {
	ctx := context.Background()
	queries := outboxdb.New(testDb.DbPool)
	unitOfWork := uow.NewUnitOfWork(testDb.DbPool)

	// Create an event without headers
	err := unitOfWork.Transact(ctx, func(ctx context.Context) error {
		txOutbox := outbox.NewOutboxRepository(outboxdb.New(unitOfWork.DBTX(ctx)))

		event := outbox.NewOutboxMessage(
			testDb.DefaultData.OrganizationID,
			"EVENT_WITHOUT_HEADERS",
			"1.0",
			map[string]string{"data": "test"},
			nil, // No headers
		)

		return txOutbox.CreateOutboxEvent(ctx, event)
	})

	require.NoError(t, err)

	// Verify the event was persisted
	events, err := queries.ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	require.NotEmpty(t, events)

	// Find our event
	var ourEvent *outboxdb.OutboxEvent
	for _, e := range events {
		if e.EventName == "EVENT_WITHOUT_HEADERS" {
			ourEvent = &e
			break
		}
	}
	require.NotNil(t, ourEvent)

	// Verify headers are null/empty
	assert.Nil(t, ourEvent.Headers)
}

// TestUnitOfWork_EventWithComplexPayload tests handling of complex nested structures
func TestUnitOfWork_EventWithComplexPayload(t *testing.T) {
	ctx := context.Background()
	queries := outboxdb.New(testDb.DbPool)
	unitOfWork := uow.NewUnitOfWork(testDb.DbPool)

	// Complex event payload
	type Address struct {
		Street  string `json:"street"`
		City    string `json:"city"`
		ZipCode string `json:"zip_code"`
	}

	type User struct {
		Name     string                 `json:"name"`
		Email    string                 `json:"email"`
		Age      int                    `json:"age"`
		Active   bool                   `json:"active"`
		Tags     []string               `json:"tags"`
		Address  Address                `json:"address"`
		Metadata map[string]interface{} `json:"metadata"`
	}

	complexPayload := User{
		Name:   "John Doe",
		Email:  "john@example.com",
		Age:    30,
		Active: true,
		Tags:   []string{"premium", "verified"},
		Address: Address{
			Street:  "123 Main St",
			City:    "New York",
			ZipCode: "10001",
		},
		Metadata: map[string]interface{}{
			"signup_date": "2024-01-01",
			"score":       95.5,
		},
	}

	// Create event with complex payload
	err := unitOfWork.Transact(ctx, func(ctx context.Context) error {
		txOutbox := outbox.NewOutboxRepository(outboxdb.New(unitOfWork.DBTX(ctx)))

		event := outbox.NewOutboxMessage(
			testDb.DefaultData.OrganizationID,
			"USER_CREATED",
			"1.0",
			complexPayload,
			nil,
		)

		return txOutbox.CreateOutboxEvent(ctx, event)
	})

	require.NoError(t, err)

	// Verify the event was persisted and can be deserialized
	events, err := queries.ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	var ourEvent *outboxdb.OutboxEvent
	for _, e := range events {
		if e.EventName == "USER_CREATED" {
			ourEvent = &e
			break
		}
	}
	require.NotNil(t, ourEvent)

	// Deserialize and verify
	var actualUser User
	err = json.Unmarshal(ourEvent.Data, &actualUser)
	require.NoError(t, err)

	assert.Equal(t, "John Doe", actualUser.Name)
	assert.Equal(t, "john@example.com", actualUser.Email)
	assert.Equal(t, 30, actualUser.Age)
	assert.True(t, actualUser.Active)
	assert.Equal(t, []string{"premium", "verified"}, actualUser.Tags)
	assert.Equal(t, "123 Main St", actualUser.Address.Street)
	assert.Equal(t, "New York", actualUser.Address.City)
	assert.Equal(t, "10001", actualUser.Address.ZipCode)
	assert.Equal(t, "2024-01-01", actualUser.Metadata["signup_date"])
	assert.Equal(t, 95.5, actualUser.Metadata["score"])
}

// TestUnitOfWork_NestedTransactJoinsRatherThanNests proves the composition
// property the whole redesign exists for: a Transact call whose ctx already
// carries a transaction (because it's nested inside another Transact call)
// joins that transaction instead of opening a second one. Two writes, one
// inside the outer closure and one inside a nested Transact call, must
// commit or roll back together as a single transaction.
func TestUnitOfWork_NestedTransactJoinsRatherThanNests(t *testing.T) {
	ctx := context.Background()
	queries := outboxdb.New(testDb.DbPool)
	unitOfWork := uow.NewUnitOfWork(testDb.DbPool)

	eventsBefore, err := queries.ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
	require.NoError(t, err)
	initialCount := len(eventsBefore)

	t.Run("both writes commit together", func(t *testing.T) {
		err := unitOfWork.Transact(ctx, func(ctx context.Context) error {
			txOutbox := outbox.NewOutboxRepository(outboxdb.New(unitOfWork.DBTX(ctx)))
			outer := outbox.NewOutboxMessage(testDb.DefaultData.OrganizationID, "NESTED_OUTER", "1.0", map[string]string{"leg": "outer"}, nil)
			if err := txOutbox.CreateOutboxEvent(ctx, outer); err != nil {
				return err
			}

			// A nested Transact call: since ctx already carries a transaction,
			// this must join it rather than opening a second one.
			return unitOfWork.Transact(ctx, func(ctx context.Context) error {
				innerOutbox := outbox.NewOutboxRepository(outboxdb.New(unitOfWork.DBTX(ctx)))
				inner := outbox.NewOutboxMessage(testDb.DefaultData.OrganizationID, "NESTED_INNER", "1.0", map[string]string{"leg": "inner"}, nil)
				return innerOutbox.CreateOutboxEvent(ctx, inner)
			})
		})
		require.NoError(t, err)

		events, err := queries.ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		assert.Equal(t, initialCount+2, len(events))
	})

	t.Run("an error in the nested call rolls back the outer write too", func(t *testing.T) {
		eventsBefore, err := queries.ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		beforeRollback := len(eventsBefore)

		err = unitOfWork.Transact(ctx, func(ctx context.Context) error {
			txOutbox := outbox.NewOutboxRepository(outboxdb.New(unitOfWork.DBTX(ctx)))
			outer := outbox.NewOutboxMessage(testDb.DefaultData.OrganizationID, "NESTED_OUTER_ROLLBACK", "1.0", map[string]string{"leg": "outer"}, nil)
			if err := txOutbox.CreateOutboxEvent(ctx, outer); err != nil {
				return err
			}

			return unitOfWork.Transact(ctx, func(_ context.Context) error {
				return assert.AnError
			})
		})
		require.Error(t, err)
		assert.Equal(t, assert.AnError, err)

		eventsAfter, err := queries.ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
		assert.Equal(t, beforeRollback, len(eventsAfter), "the outer write must roll back too -- it shares the nested call's transaction, not a separate one")
	})
}

// eventsNamed returns the outbox rows this test's transaction wrote, picked out
// by event name. The suite shares one organization and never resets, so the
// table also holds whatever every other test in the package left behind --
// asserting on the row count instead makes a test pass or fail on which
// position `go test -shuffle=on` gave it.
func eventsNamed(t *testing.T, queries *outboxdb.Queries, names ...string) []outboxdb.OutboxEvent {
	t.Helper()

	rows, err := queries.ListOutboxEvents(context.Background(), testDb.DefaultData.OrganizationID)
	require.NoError(t, err)

	wanted := make(map[string]struct{}, len(names))
	for _, name := range names {
		wanted[name] = struct{}{}
	}

	found := make([]outboxdb.OutboxEvent, 0, len(names))
	for _, row := range rows {
		if _, ok := wanted[row.EventName]; ok {
			found = append(found, row)
		}
	}
	return found
}

// TestUnitOfWork_AmbientFollowsTheCallersTransaction covers the reason Ambient
// exists, and it is a deadlock rather than a wrong answer.
//
// A module wires its sqlc Queries once, at startup, from whatever DBTX it was
// handed. Bound to the pool, that value cannot see a transaction its caller
// opened later -- so a Queries used inside Transact goes to the pool for a
// SECOND connection while the transaction it is running in already holds one.
// One caller gets away with it. At MaxConns concurrent callers every connection
// in the pool is held by a transaction waiting for one more, nothing times out
// and nothing errors, and the work simply stops until the process restarts.
// That is the shape the CDC dispatcher has: it wraps the inbox mark and the
// consumer's own queries in a single transaction.
//
// MaxConns = 1 is that condition with one caller instead of many, which is what
// makes it a test rather than a load experiment.
func TestUnitOfWork_AmbientFollowsTheCallersTransaction(t *testing.T) {
	config := testDb.DbPool.Config()
	config.MaxConns = 1
	config.MinConns = 0

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	require.NoError(t, err)
	defer pool.Close()

	unitOfWork := uow.NewUnitOfWork(pool)

	t.Run("a handle bound before the transaction existed still joins it", func(t *testing.T) {
		// Built once, outside any transaction, exactly as a module builds its
		// Queries at wiring time -- and never rebuilt per call.
		queries := outboxdb.New(unitOfWork.Ambient())

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		err := unitOfWork.Transact(ctx, func(ctx context.Context) error {
			event := outbox.NewOutboxMessage(
				testDb.DefaultData.OrganizationID,
				"AMBIENT_INSIDE_TX",
				"1.0",
				map[string]string{"handle": "ambient"},
				nil,
			)
			return outbox.NewOutboxRepository(queries).CreateOutboxEvent(ctx, event)
		})
		require.NoError(t, err, "the ambient handle asked the pool for a second connection instead of joining the transaction")

		// The write committed rather than being quietly discarded: joining the
		// transaction has to mean joining the one that commits.
		require.Len(t, eventsNamed(t, outboxdb.New(testDb.DbPool), "AMBIENT_INSIDE_TX"), 1)
	})

	// The other half of "transparent": outside a transaction the handle is the
	// pool, so every HTTP endpoint sharing one of these values behaves exactly
	// as it did when it was handed svc.Pool directly.
	t.Run("outside a transaction it is just the pool", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		_, err := outboxdb.New(unitOfWork.Ambient()).ListOutboxEvents(ctx, testDb.DefaultData.OrganizationID)
		require.NoError(t, err)
	})

	// The bug itself, asserted rather than described, so that a future change
	// swapping an Ambient() back to a pool has this to argue with. The deadline
	// is what turns the hang into a test result: the acquire can never succeed,
	// because the only connection is held by the transaction making the call.
	t.Run("the pool-bound equivalent waits for a connection it cannot get", func(t *testing.T) {
		queries := outboxdb.New(pool)

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		err := unitOfWork.Transact(ctx, func(ctx context.Context) error {
			event := outbox.NewOutboxMessage(
				testDb.DefaultData.OrganizationID,
				"POOL_BOUND_INSIDE_TX",
				"1.0",
				map[string]string{"handle": "pool"},
				nil,
			)
			return outbox.NewOutboxRepository(queries).CreateOutboxEvent(ctx, event)
		})
		require.ErrorIs(t, err, context.DeadlineExceeded)

		assert.Empty(t, eventsNamed(t, outboxdb.New(testDb.DbPool), "POOL_BOUND_INSIDE_TX"))
	})
}
