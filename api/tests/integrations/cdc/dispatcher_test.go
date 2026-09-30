package cdc_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/cdc"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/pkg/debezium"
)

// The fan-out's whole contract is about what survives a partial failure, and every
// part of it is a transaction boundary: which marks are committed, which are rolled
// back, and what a second delivery therefore does. None of that is observable without
// a real Postgres, so these tests drive the real Dispatcher against the test database
// with consumers they control -- rather than through the wired app, whose consumers
// cannot be made to fail on demand.

// barrierTimeout bounds the wait in the concurrency test. It only ever elapses when
// the dispatcher stopped running consumers at the same time, so it is generous: long
// enough that a loaded CI machine cannot trip it, short enough that the test reports
// the regression instead of hanging until the package timeout.
const barrierTimeout = 15 * time.Second

// recordingConsumer is a Consumer whose three answers are set by the test: what it is
// called, what it wants, and whether its work succeeds. It counts the calls that
// actually reached it, which is the thing every assertion below is about.
type recordingConsumer struct {
	name  string
	wants func(debezium.Event) bool
	fail  error

	// consume, when set, runs inside Consume and decides its answer. It is how a test
	// makes two consumers observe each other -- the only honest way to assert that
	// they run at the same time, since timing can only ever suggest it.
	consume func() error

	mu    sync.Mutex
	calls int
}

func newConsumer(name string) *recordingConsumer {
	return &recordingConsumer{name: name}
}

func (c *recordingConsumer) Name() string { return c.name }

func (c *recordingConsumer) Wants(event debezium.Event) bool {
	if c.wants == nil {
		return true
	}
	return c.wants(event)
}

func (c *recordingConsumer) Consume(context.Context, debezium.Event) error {
	c.mu.Lock()
	c.calls++
	c.mu.Unlock()

	if c.consume != nil {
		if err := c.consume(); err != nil {
			return err
		}
	}

	return c.fail
}

func (c *recordingConsumer) Calls() int {
	c.mu.Lock()
	defer c.mu.Unlock()

	return c.calls
}

// TestDispatcherRunsEveryConsumerAndRecordsThemIndependently is the base case: both
// consumers do the work once, and each leaves its own mark. One row would mean they
// are sharing dedup state and the second delivery would skip one of them.
func TestDispatcherRunsEveryConsumerAndRecordsThemIndependently(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	organizationID := testDb.DefaultData.OrganizationID
	audit, connector := newConsumer("audit-trail"), newConsumer("connector-under-test")
	dispatcher := newDispatcher(t, audit, connector)
	event := syntheticEvent(organizationID)

	require.Equal(t, cdc.Success, dispatcher.Handle(t.Context(), organizationID, event))

	assert.Equal(t, 1, audit.Calls())
	assert.Equal(t, 1, connector.Calls())
	assert.Equal(t, 1, countInboxRows(t, organizationID, eventUUID(t, event), audit.Name()))
	assert.Equal(t, 1, countInboxRows(t, organizationID, eventUUID(t, event), connector.Name()))
}

// TestDispatcherRetriesOnlyTheConsumerThatFailed is the requirement this whole change
// exists for: a redelivery caused by one consumer must not replay another's work.
func TestDispatcherRetriesOnlyTheConsumerThatFailed(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	organizationID := testDb.DefaultData.OrganizationID
	audit, connector := newConsumer("audit-trail"), newConsumer("connector-under-test")
	connector.fail = errors.New("the third-party API is down")

	dispatcher := newDispatcher(t, audit, connector)
	event := syntheticEvent(organizationID)
	messageID := eventUUID(t, event)

	// First delivery: one consumer succeeds, the other does not.
	require.Equal(t, cdc.Retry, dispatcher.Handle(t.Context(), organizationID, event),
		"a delivery one consumer still owes must be redelivered")
	require.Equal(t, 1, audit.Calls())
	require.Equal(t, 1, connector.Calls())

	// The successful consumer's mark is committed; the failed one's rolled back with
	// its work. That asymmetry is the entire mechanism.
	require.Equal(t, 1, countInboxRows(t, organizationID, messageID, audit.Name()))
	require.Zero(t, countInboxRows(t, organizationID, messageID, connector.Name()),
		"a consumer that failed must leave no mark, or its retry would be skipped as a duplicate")

	// The redelivery runs the failed consumer only.
	connector.fail = nil
	require.Equal(t, cdc.Success, dispatcher.Handle(t.Context(), organizationID, event))
	assert.Equal(t, 1, audit.Calls(), "the consumer that already succeeded must not run again")
	assert.Equal(t, 2, connector.Calls(), "the consumer that failed must run again")

	// And once both have succeeded, further duplicates run neither.
	require.Equal(t, cdc.Success, dispatcher.Handle(t.Context(), organizationID, event))
	assert.Equal(t, 1, audit.Calls())
	assert.Equal(t, 2, connector.Calls())
	assert.Equal(t, 1, countInboxRows(t, organizationID, messageID, audit.Name()))
	assert.Equal(t, 1, countInboxRows(t, organizationID, messageID, connector.Name()))
}

// TestDispatcherSkipsConsumersThatDoNotWantTheEvent pins the other half of the
// filter's contract: a consumer that opts out records nothing. A mark written for
// work that was never in scope would be permanent -- widening the filter later would
// find those messages already consumed.
func TestDispatcherSkipsConsumersThatDoNotWantTheEvent(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	organizationID := testDb.DefaultData.OrganizationID
	audit := newConsumer("audit-trail")
	connector := newConsumer("connector-under-test")
	connector.wants = func(event debezium.Event) bool {
		return event.EventType == "com.kaiten.customer.v1.created"
	}

	dispatcher := newDispatcher(t, audit, connector)
	event := syntheticEvent(organizationID) // event_type is "1.0", not a customer event
	messageID := eventUUID(t, event)

	require.Equal(t, cdc.Success, dispatcher.Handle(t.Context(), organizationID, event))

	assert.Equal(t, 1, audit.Calls())
	assert.Zero(t, connector.Calls())
	assert.Equal(t, 1, countInboxRows(t, organizationID, messageID, audit.Name()))
	assert.Zero(t, countInboxRows(t, organizationID, messageID, connector.Name()),
		"a consumer that did not want the event must leave no mark to skip itself with later")
}

// TestDispatcherIsSafeUnderConcurrentDuplicateDelivery covers the race the ON
// CONFLICT insert exists for: two sidecar deliveries of the same message arriving at
// once must not let a consumer do its work twice.
func TestDispatcherIsSafeUnderConcurrentDuplicateDelivery(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	organizationID := testDb.DefaultData.OrganizationID
	audit, connector := newConsumer("audit-trail"), newConsumer("connector-under-test")
	dispatcher := newDispatcher(t, audit, connector)
	event := syntheticEvent(organizationID)

	const deliveries = 8
	decisions := make([]cdc.Decision, deliveries)

	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := range deliveries {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			decisions[i] = dispatcher.Handle(context.Background(), organizationID, event)
		}()
	}
	close(start)
	wg.Wait()

	for i, decision := range decisions {
		assert.Equal(t, cdc.Success, decision, "delivery %d", i)
	}
	assert.Equal(t, 1, audit.Calls(), "concurrent duplicates must not run a consumer twice")
	assert.Equal(t, 1, connector.Calls(), "concurrent duplicates must not run a consumer twice")
	assert.Equal(t, 1, countInboxRows(t, organizationID, eventUUID(t, event), audit.Name()))
	assert.Equal(t, 1, countInboxRows(t, organizationID, eventUUID(t, event), connector.Name()))
}

// TestDispatcherRunsConsumersAtTheSameTimeAndWaitsForAllOfThem is the fan-out's other
// half: the consumers do not queue behind each other, and the delivery is not answered
// until every one of them is done.
//
// Both consumers block until the other has entered Consume, so a dispatcher that ran
// them one after another could not get past the first -- it fails the barrier rather
// than an assertion about elapsed time, which is the only way to tell "concurrent"
// from "fast" without making the test flaky. And because Handle returned before
// anything below is read, both marks being committed is what "waits for all of them"
// means.
func TestDispatcherRunsConsumersAtTheSameTimeAndWaitsForAllOfThem(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	organizationID := testDb.DefaultData.OrganizationID
	audit, connector := newConsumer("audit-trail"), newConsumer("connector-under-test")

	var arrived sync.WaitGroup
	arrived.Add(2)
	opened := make(chan struct{})
	go func() {
		arrived.Wait()
		close(opened)
	}()

	barrier := func() error {
		arrived.Done()
		select {
		case <-opened:
			return nil
		case <-time.After(barrierTimeout):
			return errors.New("the other consumer never started: the fan-out ran sequentially")
		}
	}
	audit.consume, connector.consume = barrier, barrier

	dispatcher := newDispatcher(t, audit, connector)
	event := syntheticEvent(organizationID)

	require.Equal(t, cdc.Success, dispatcher.Handle(t.Context(), organizationID, event))

	assert.Equal(t, 1, audit.Calls())
	assert.Equal(t, 1, connector.Calls())
	assert.Equal(t, 1, countInboxRows(t, organizationID, eventUUID(t, event), audit.Name()),
		"Handle must not answer the delivery before every consumer has committed")
	assert.Equal(t, 1, countInboxRows(t, organizationID, eventUUID(t, event), connector.Name()),
		"Handle must not answer the delivery before every consumer has committed")
}

// TestDispatcherTurnsAConsumerPanicIntoARetry covers what running consumers on their
// own goroutines would otherwise have cost: a panic used to unwind into the Fiber
// handler, whose recover middleware answered 500 and got the message redelivered.
// Off the request goroutine there is nothing above to catch it, so the dispatcher
// does -- and the consumer that did its work still keeps it.
func TestDispatcherTurnsAConsumerPanicIntoARetry(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	organizationID := testDb.DefaultData.OrganizationID
	audit, connector := newConsumer("audit-trail"), newConsumer("connector-under-test")
	connector.consume = func() error { panic("a nil map in a connector") }

	dispatcher := newDispatcher(t, audit, connector)
	event := syntheticEvent(organizationID)
	messageID := eventUUID(t, event)

	require.Equal(t, cdc.Retry, dispatcher.Handle(t.Context(), organizationID, event),
		"a panicking consumer still owes the message")

	assert.Equal(t, 1, audit.Calls())
	assert.Equal(t, 1, countInboxRows(t, organizationID, messageID, audit.Name()),
		"the consumer that succeeded must keep its mark")
	assert.Zero(t, countInboxRows(t, organizationID, messageID, connector.Name()),
		"a panic must roll the mark back with the work, like any other failure")
}

// TestNewDispatcherRefusesUnusableConsumerSets pins the two wiring mistakes that have
// no runtime symptom, so they are caught where a driver can still report them.
func TestNewDispatcherRefusesUnusableConsumerSets(t *testing.T) {
	uof := uow.NewUnitOfWork(testDb.DbPool)

	t.Run("no consumers", func(t *testing.T) {
		_, err := cdc.NewDispatcher(uof)

		require.ErrorIs(t, err, cdc.ErrNoConsumers)
	})

	t.Run("an empty name", func(t *testing.T) {
		_, err := cdc.NewDispatcher(uof, newConsumer(""))

		require.ErrorContains(t, err, "empty name")
	})

	// Two consumers under one name share one inbox row, so the first to run tells the
	// second its work is already done -- silently, and for every message.
	t.Run("a duplicate name", func(t *testing.T) {
		_, err := cdc.NewDispatcher(uof, newConsumer("audit-trail"), newConsumer("audit-trail"))

		require.ErrorContains(t, err, `two consumers are named "audit-trail"`)
	})
}

func newDispatcher(t *testing.T, consumers ...cdc.Consumer) *cdc.Dispatcher {
	t.Helper()

	dispatcher, err := cdc.NewDispatcher(uow.NewUnitOfWork(testDb.DbPool), consumers...)
	require.NoError(t, err)

	return dispatcher
}

// syntheticEvent is an outbox row as the dispatcher receives it, already parsed --
// these tests are about what happens after the envelope, which subscriber_test.go
// covers from the route inwards.
func syntheticEvent(organizationID uuid.UUID) debezium.Event {
	return debezium.Event{
		ID:             uuid.NewString(),
		OrganizationID: organizationID.String(),
		EventName:      "INSTANCE_CREATION",
		EventType:      "1.0",
		Data:           `{"slug":"test-instance"}`,
		OccurredAt:     time.Now().UTC(),
	}
}

func eventUUID(t *testing.T, event debezium.Event) uuid.UUID {
	t.Helper()

	id, err := uuid.Parse(event.ID)
	require.NoError(t, err)

	return id
}
