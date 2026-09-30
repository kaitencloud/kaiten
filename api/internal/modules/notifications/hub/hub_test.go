package hub_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/modules/notifications/hub"
)

func TestRecipientsAreScopedToTheOrganizationAndSubscription(t *testing.T) {
	t.Parallel()

	streams := hub.New(10)
	org, other := uuid.New(), uuid.New()

	subscribed, err := streams.Add(uuid.New(), org, 1)
	require.NoError(t, err)
	subscribed.SetSubscription([]string{"INSTANCE_DEPLOYED"})

	muted, err := streams.Add(uuid.New(), org, 1)
	require.NoError(t, err)
	muted.SetSubscription([]string{"INSTANCE_CREATED"})

	elsewhere, err := streams.Add(uuid.New(), other, 1)
	require.NoError(t, err)
	elsewhere.SetSubscription([]string{"INSTANCE_DEPLOYED"})

	recipients := streams.Recipients(org, "INSTANCE_DEPLOYED")

	require.Len(t, recipients, 1)
	assert.Same(t, subscribed, recipients[0])
}

func TestAnInvalidatedSubscriptionErrsTowardsDelivery(t *testing.T) {
	t.Parallel()

	// A stream whose subscription was dropped because the user changed their
	// preferences has not re-resolved yet. Delivering one notification the user
	// just muted is a smaller failure than silently dropping one they asked for,
	// and the next fan-out re-resolves it.
	streams := hub.New(10)
	org := uuid.New()
	userID := uuid.New()

	connection, err := streams.Add(userID, org, 1)
	require.NoError(t, err)
	connection.SetSubscription([]string{"INSTANCE_CREATED"})

	assert.Empty(t, streams.Recipients(org, "INSTANCE_DEPLOYED"))

	streams.InvalidateSubscription(userID)

	assert.Len(t, streams.Recipients(org, "INSTANCE_DEPLOYED"), 1)
}

func TestTheOldestStreamIsEvictedPastThePerUserCap(t *testing.T) {
	t.Parallel()

	streams := hub.New(100)
	userID, org := uuid.New(), uuid.New()

	first, err := streams.Add(userID, org, 1)
	require.NoError(t, err)

	for range hub.MaxPerUser {
		_, err = streams.Add(userID, org, 1)
		require.NoError(t, err)
	}

	// The newest tab is the one the person is looking at, so the oldest goes.
	select {
	case <-first.Closed():
	default:
		t.Fatal("the oldest connection should have been closed")
	}

	assert.Equal(t, hub.MaxPerUser, streams.Len())
}

func TestTheReplicaRefusesPastItsCeiling(t *testing.T) {
	t.Parallel()

	streams := hub.New(1)
	_, err := streams.Add(uuid.New(), uuid.New(), 1)
	require.NoError(t, err)

	_, err = streams.Add(uuid.New(), uuid.New(), 1)

	// A reconnect storm must cost a 503 the client backs off from, not unbounded
	// goroutines on the pod.
	require.ErrorAs(t, err, &hub.ErrAtCapacity{})
}

func TestASlowReaderDropsFramesRatherThanBlockingTheFanOut(t *testing.T) {
	t.Parallel()

	// The contract says the stream is a hint and the client refetches on
	// reconnect, so a dropped frame costs a stale badge. Blocking here would
	// freeze every other stream on the replica behind one slow reader.
	streams := hub.New(10)
	connection, err := streams.Add(uuid.New(), uuid.New(), 1)
	require.NoError(t, err)

	assert.True(t, connection.Send(hub.Frame{Name: hub.FrameNotification}))
	assert.False(t, connection.Send(hub.Frame{Name: hub.FrameNotification}))
}

func TestRemovingTwiceIsSafe(t *testing.T) {
	t.Parallel()

	// The handler always removes on its way out, including when the hub already
	// evicted the connection.
	streams := hub.New(10)
	connection, err := streams.Add(uuid.New(), uuid.New(), 1)
	require.NoError(t, err)

	streams.Remove(connection)
	streams.Remove(connection)

	assert.Zero(t, streams.Len())
}
