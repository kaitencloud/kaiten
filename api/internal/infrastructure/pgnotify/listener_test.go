package pgnotify

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgproto3"
	"github.com/stretchr/testify/require"
)

// TestRunStopsWhileReconnecting tests that run returns cleanly when its
// context is cancelled while it is still trying to replace a dropped
// connection -- e.g. Stop during a Postgres restart. reconnect then hands
// back a nil connection, which run must not try to close.
func TestRunStopsWhileReconnecting(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	// Every reconnect attempt fails, and the first one also cancels ctx, so
	// the cancellation is guaranteed to land inside reconnect's retry loop.
	failingConfig := parseTestConfig(t)
	failingConfig.DialFunc = func(context.Context, string, string) (net.Conn, error) {
		cancel()
		return nil, errors.New("connection refused")
	}
	listener := NewListener(failingConfig,
		WithLogger(slog.New(slog.NewTextHandler(io.Discard, nil))),
		WithReconnectDelay(time.Millisecond),
	)

	conn, drop := connectToFakeServer(t)
	drop()

	panicked := make(chan any, 1)
	go func() {
		defer func() { panicked <- recover() }()
		listener.run(ctx, conn)
	}()

	select {
	case r := <-panicked:
		require.Nil(t, r, "run panicked")
	case <-time.After(5 * time.Second):
		t.Fatal("run did not return after its context was cancelled")
	}
}

// parseTestConfig returns a ConnConfig for tests that override DialFunc, so
// the host and port are never dialed. sslmode=disable skips the SSLRequest a
// fake server would otherwise have to answer.
func parseTestConfig(t *testing.T) *pgx.ConnConfig {
	t.Helper()
	cfg, err := pgx.ParseConfig("postgres://kaiten@127.0.0.1:5432/kaiten?sslmode=disable")
	require.NoError(t, err)
	return cfg
}

// connectToFakeServer opens a *pgx.Conn to an in-memory server that only
// completes the startup handshake. Calling drop hangs the server up, the
// way a Postgres restart drops a LISTEN connection.
func connectToFakeServer(t *testing.T) (conn *pgx.Conn, drop func()) {
	t.Helper()

	client, server := net.Pipe()
	t.Cleanup(func() { _ = server.Close() })

	handshake := make(chan error, 1)
	go func() {
		backend := pgproto3.NewBackend(server, server)
		if _, err := backend.ReceiveStartupMessage(); err != nil {
			handshake <- err
			return
		}
		backend.Send(&pgproto3.AuthenticationOk{})
		backend.Send(&pgproto3.ReadyForQuery{TxStatus: 'I'})
		handshake <- backend.Flush()
	}()

	cfg := parseTestConfig(t)
	cfg.DialFunc = func(context.Context, string, string) (net.Conn, error) {
		return client, nil
	}
	conn, err := pgx.ConnectConfig(t.Context(), cfg)
	require.NoError(t, err)
	require.NoError(t, <-handshake)

	return conn, func() { _ = server.Close() }
}
