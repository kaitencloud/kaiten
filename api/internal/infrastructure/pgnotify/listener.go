// Package pgnotify provides a minimal Postgres LISTEN/NOTIFY based fan-out
// mechanism for propagating in-process events -- initially, cache
// invalidation -- to every replica of this API, without requiring a shared
// external cache (Redis et al.) or the heavier Debezium+Dapr outbox/CDC
// pipeline this codebase already uses for cross-service domain events (see
// internal/infrastructure/outbox and pkg/debezium). That pipeline is the
// right tool for durable, at-least-once delivery of domain events to other
// services; it is the wrong shape for "tell my own sibling processes to
// evict one cache key," which needs neither durability nor a broker, just a
// fast best-effort fan-out between processes that all already talk to the
// same Postgres. The package is named after the Postgres feature it wraps,
// rather than "pubsub", to avoid confusion with the Dapr/RabbitMQ pubsub
// this codebase already has elsewhere (see audittrail/subscriber's
// "rabbitmq-pubsub" component) -- the two share no code path.
//
// A pgxpool connection is the wrong shape for the LISTEN side of that: pool
// connections are handed out, reused, health-checked and recycled by the
// pool, none of which is compatible with a connection that must sit in
// LISTEN state indefinitely and reconnect on its own schedule when the
// network drops. Listener instead owns a single raw *pgx.Conn outside any
// pool, dialed from a copy of the same ConnConfig the pool itself was built
// from (see internal/infrastructure/database.buildPoolConfig).
//
// The NOTIFY side needs no dedicated connection: Publish issues a plain
// `SELECT pg_notify(...)` through the caller's DBTX, so it works equally
// well against the shared pool or against a transaction obtained via
// uow.DBTX(ctx) -- see notify.go for why that matters.
package pgnotify

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	defaultReconnectDelay = 2 * time.Second
	defaultDialTimeout    = 5 * time.Second
)

// Handler processes a single notification payload delivered on a channel.
// It runs synchronously on the Listener's dispatch goroutine, so it should
// be fast (e.g. a map delete) -- it is not a place to do IO. A panic inside
// a Handler is recovered and logged rather than crashing the listener.
type Handler func(ctx context.Context, payload string)

// Listener maintains one long-lived LISTEN connection to Postgres, fans out
// every NOTIFY it receives to the Handlers registered for that channel, and
// transparently reconnects (re-issuing LISTEN for every registered channel)
// if the connection drops.
//
// Register must be called before Start: Start issues LISTEN for exactly the
// channels registered up to that point, and a later reconnect re-listens on
// that same fixed set -- it does not discover channels registered after
// Start. Each module that needs cross-replica notifications builds, wires
// up, and starts its own Listener from within its own NewUseCases -- the
// same pattern this codebase already uses for other self-contained
// background workers (see featureflags_module.go's evaluationPublisher) --
// so Register and Start are always called back-to-back by the same owner
// (see identity_module.go and metadatafield_module.go for the two current
// registrants).
type Listener struct {
	connConfig     *pgx.ConnConfig
	logger         *slog.Logger
	reconnectDelay time.Duration
	dialTimeout    time.Duration

	mu       sync.Mutex
	handlers map[string][]Handler

	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// Option customizes a Listener created by NewListener.
type Option func(*Listener)

// WithLogger overrides the default slog.Default() logger.
func WithLogger(logger *slog.Logger) Option {
	return func(l *Listener) { l.logger = logger }
}

// WithReconnectDelay overrides the default delay between reconnect attempts.
func WithReconnectDelay(d time.Duration) Option {
	return func(l *Listener) { l.reconnectDelay = d }
}

// NewListener creates a Listener that will dial using a copy of connConfig.
// connConfig is typically services.Container.PgNotifyConnConfig, itself a
// copy of the pgxpool.Pool's own ConnConfig -- see server.registerModules.
func NewListener(connConfig *pgx.ConnConfig, opts ...Option) *Listener {
	l := &Listener{
		connConfig:     connConfig,
		logger:         slog.Default(),
		reconnectDelay: defaultReconnectDelay,
		dialTimeout:    defaultDialTimeout,
		handlers:       make(map[string][]Handler),
	}
	for _, opt := range opts {
		opt(l)
	}
	return l
}

// Register adds handler to the set invoked whenever a NOTIFY arrives on
// channel. See the Listener doc comment for the ordering requirement
// relative to Start.
func (l *Listener) Register(channel string, handler Handler) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.handlers[channel] = append(l.handlers[channel], handler)
}

// Start dials a dedicated connection, issues LISTEN for every channel
// Registered so far, and launches a background goroutine that dispatches
// incoming notifications to their registered handlers. It returns an error
// only if that initial connection or the initial LISTEN statements fail;
// once running, connection loss is retried internally (with
// WithReconnectDelay between attempts) and logged rather than surfaced to
// the caller. Call Stop to shut the background goroutine down.
func (l *Listener) Start(ctx context.Context) error {
	conn, err := l.connectAndListen(ctx)
	if err != nil {
		return fmt.Errorf("pgnotify: initial connect: %w", err)
	}

	runCtx, cancel := context.WithCancel(context.WithoutCancel(ctx))
	l.cancel = cancel
	l.wg.Add(1)
	go func() {
		defer l.wg.Done()
		l.run(runCtx, conn)
	}()
	return nil
}

// Stop cancels the background goroutine and blocks until its connection has
// closed. Safe to call even if Start was never called or returned an error.
func (l *Listener) Stop() {
	if l.cancel != nil {
		l.cancel()
	}
	l.wg.Wait()
}

// channels returns a snapshot of the currently registered channel names.
func (l *Listener) channels() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	channels := make([]string, 0, len(l.handlers))
	for ch := range l.handlers {
		channels = append(channels, ch)
	}
	return channels
}

// connectAndListen dials a fresh connection and issues LISTEN for every
// registered channel. On any failure it closes the partially-set-up
// connection before returning so callers never leak a dangling *pgx.Conn.
func (l *Listener) connectAndListen(ctx context.Context) (*pgx.Conn, error) {
	dialCtx, dialCancel := context.WithTimeout(ctx, l.dialTimeout)
	defer dialCancel()

	conn, err := pgx.ConnectConfig(dialCtx, l.connConfig.Copy())
	if err != nil {
		return nil, err
	}

	for _, ch := range l.channels() {
		if _, err := conn.Exec(dialCtx, "LISTEN "+pgx.Identifier{ch}.Sanitize()); err != nil {
			_ = conn.Close(context.WithoutCancel(ctx))
			return nil, fmt.Errorf("LISTEN %s: %w", ch, err)
		}
	}
	return conn, nil
}

// run owns conn for its lifetime: it blocks waiting for notifications,
// dispatches each to its registered handlers, and transparently reconnects
// (re-issuing LISTEN for every registered channel) if the connection drops
// for any reason other than ctx being cancelled by Stop.
func (l *Listener) run(ctx context.Context, conn *pgx.Conn) {
	defer func() {
		// conn is nil when Stop lands while reconnect is still retrying.
		if conn != nil {
			_ = conn.Close(context.Background())
		}
	}()

	for {
		notification, err := conn.WaitForNotification(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			l.logger.WarnContext(ctx, "pgnotify: listen connection lost, reconnecting", "error", err)
			_ = conn.Close(context.Background())

			conn = l.reconnect(ctx)
			if conn == nil {
				return
			}
			continue
		}
		l.dispatch(ctx, notification)
	}
}

// reconnect retries connectAndListen with a fixed delay between attempts
// until it succeeds or ctx is cancelled (in which case it returns nil).
func (l *Listener) reconnect(ctx context.Context) *pgx.Conn {
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(l.reconnectDelay):
		}

		conn, err := l.connectAndListen(ctx)
		if err != nil {
			l.logger.WarnContext(ctx, "pgnotify: reconnect failed, retrying", "error", err)
			continue
		}
		return conn
	}
}

// dispatch invokes every handler registered for n.Channel, recovering from
// (and logging) any panic so one misbehaving handler can't take down the
// listener or block delivery to the others.
func (l *Listener) dispatch(ctx context.Context, n *pgconn.Notification) {
	l.mu.Lock()
	handlers := append([]Handler(nil), l.handlers[n.Channel]...)
	l.mu.Unlock()

	for _, h := range handlers {
		l.invoke(ctx, h, n)
	}
}

func (l *Listener) invoke(ctx context.Context, h Handler, n *pgconn.Notification) {
	defer func() {
		if r := recover(); r != nil {
			l.logger.ErrorContext(ctx, "pgnotify: handler panicked", "channel", n.Channel, "panic", r)
		}
	}()
	h(ctx, n.Payload)
}
