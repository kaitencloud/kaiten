// Package pgnotify_test proves internal/infrastructure/pgnotify against a real
// PostgreSQL server (via the shared testcontainers fixture, tests.TestDatabase)
// rather than against a mock -- LISTEN/NOTIFY is a server feature with no
// meaningful in-memory fake, and the property this package exists for --
// "a NOTIFY on one connection reaches a LISTEN on another, and only once the
// triggering transaction actually commits" -- is exactly the kind of thing a
// mock would let slip through.
package pgnotify_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
)

const eventuallyTimeout = 5 * time.Second

// TestListener_NotifyReachesLISTENer is the core proof this package exists
// for: a NOTIFY issued on one connection (via pgnotify.Publish, exactly as a
// write handler would call it) is delivered to a Handler registered on a
// completely different, long-lived LISTEN connection (a Listener, exactly
// as a module wires one up at startup).
func TestListener_NotifyReachesLISTENer(t *testing.T) {
	channel := "pgnotify_test_" + uuid.NewString()[:8]

	received := make(chan string, 1)
	listener := pgnotify.NewListener(testDb.DbPool.Config().ConnConfig.Copy())
	listener.Register(channel, func(_ context.Context, payload string) {
		received <- payload
	})

	ctx := context.Background()
	require.NoError(t, listener.Start(ctx))
	defer listener.Stop()

	// Publish from an entirely separate connection (the shared pool), the
	// same way any write handler does via uow.DBTX(ctx) or the pool itself.
	require.NoError(t, pgnotify.Publish(ctx, testDb.DbPool, channel, "hello-from-another-connection"))

	select {
	case payload := <-received:
		assert.Equal(t, "hello-from-another-connection", payload)
	case <-time.After(eventuallyTimeout):
		t.Fatal("handler was not invoked before timeout — NOTIFY never reached the LISTEN-ing connection")
	}
}

// TestListener_MultipleChannelsDispatchIndependently proves a single
// Listener correctly multiplexes several channels on its one connection,
// routing each notification only to the handlers registered for its own
// channel. Each module today builds its own single-channel Listener (see
// identity_module.go and metadatafield_module.go), but the Listener type
// itself supports several channels per connection, and that's what this
// test covers.
func TestListener_MultipleChannelsDispatchIndependently(t *testing.T) {
	channelA := "pgnotify_test_a_" + uuid.NewString()[:8]
	channelB := "pgnotify_test_b_" + uuid.NewString()[:8]

	receivedA := make(chan string, 1)
	receivedB := make(chan string, 1)

	listener := pgnotify.NewListener(testDb.DbPool.Config().ConnConfig.Copy())
	listener.Register(channelA, func(_ context.Context, payload string) { receivedA <- payload })
	listener.Register(channelB, func(_ context.Context, payload string) { receivedB <- payload })

	ctx := context.Background()
	require.NoError(t, listener.Start(ctx))
	defer listener.Stop()

	require.NoError(t, pgnotify.Publish(ctx, testDb.DbPool, channelB, "for-b-only"))

	select {
	case payload := <-receivedB:
		assert.Equal(t, "for-b-only", payload)
	case <-time.After(eventuallyTimeout):
		t.Fatal("handler for channelB was not invoked before timeout")
	}

	select {
	case payload := <-receivedA:
		t.Fatalf("handler for channelA fired for a notification published on channelB: %q", payload)
	case <-time.After(200 * time.Millisecond):
		// Expected: nothing arrives on A.
	}
}

// TestPublish_OnlyDeliveredAfterCommit proves the correctness property the
// task description called out explicitly: NOTIFY issued through a
// transaction-scoped DBTX (obtained via uow.DBTX(ctx) inside a Transact
// call) is queued by Postgres and only delivered to LISTEN-ing connections
// once that transaction commits -- and is silently discarded if the
// transaction rolls back instead. This is native PostgreSQL behaviour, not
// something pgnotify.Publish implements itself, but it's the whole reason
// callers are told to publish through the transaction-scoped handle rather
// than a fire-and-forget separate connection.
func TestPublish_OnlyDeliveredAfterCommit(t *testing.T) {
	t.Run("rolled back transaction never delivers", func(t *testing.T) {
		channel := "pgnotify_test_rollback_" + uuid.NewString()[:8]
		received := make(chan string, 1)

		listener := pgnotify.NewListener(testDb.DbPool.Config().ConnConfig.Copy())
		listener.Register(channel, func(_ context.Context, payload string) { received <- payload })

		ctx := context.Background()
		require.NoError(t, listener.Start(ctx))
		defer listener.Stop()

		unitOfWork := uow.NewUnitOfWork(testDb.DbPool)
		rollbackErr := assert.AnError
		err := unitOfWork.Transact(ctx, func(ctx context.Context) error {
			if pubErr := pgnotify.Publish(ctx, unitOfWork.DBTX(ctx), channel, "should-never-arrive"); pubErr != nil {
				return pubErr
			}
			return rollbackErr
		})
		require.ErrorIs(t, err, rollbackErr)

		select {
		case payload := <-received:
			t.Fatalf("handler fired for a NOTIFY issued inside a rolled-back transaction: %q", payload)
		case <-time.After(500 * time.Millisecond):
			// Expected: the rollback discarded the queued NOTIFY.
		}
	})

	t.Run("committed transaction delivers", func(t *testing.T) {
		channel := "pgnotify_test_commit_" + uuid.NewString()[:8]
		received := make(chan string, 1)

		listener := pgnotify.NewListener(testDb.DbPool.Config().ConnConfig.Copy())
		listener.Register(channel, func(_ context.Context, payload string) { received <- payload })

		ctx := context.Background()
		require.NoError(t, listener.Start(ctx))
		defer listener.Stop()

		unitOfWork := uow.NewUnitOfWork(testDb.DbPool)
		err := unitOfWork.Transact(ctx, func(ctx context.Context) error {
			return pgnotify.Publish(ctx, unitOfWork.DBTX(ctx), channel, "arrives-after-commit")
		})
		require.NoError(t, err)

		select {
		case payload := <-received:
			assert.Equal(t, "arrives-after-commit", payload)
		case <-time.After(eventuallyTimeout):
			t.Fatal("handler was not invoked before timeout for a NOTIFY issued inside a committed transaction")
		}
	})
}

// TestListener_StopClosesCleanly proves Stop terminates the background
// goroutine (rather than leaking it) even with no notifications ever
// received -- Start/Stop is the exact lifecycle each module drives via
// WorkerRegistry.OnStop.
func TestListener_StopClosesCleanly(t *testing.T) {
	channel := "pgnotify_test_stop_" + uuid.NewString()[:8]
	listener := pgnotify.NewListener(testDb.DbPool.Config().ConnConfig.Copy())
	listener.Register(channel, func(context.Context, string) {})

	require.NoError(t, listener.Start(context.Background()))

	stopped := make(chan struct{})
	go func() {
		listener.Stop()
		close(stopped)
	}()

	select {
	case <-stopped:
	case <-time.After(eventuallyTimeout):
		t.Fatal("Stop did not return before timeout — background goroutine likely leaked")
	}
}
