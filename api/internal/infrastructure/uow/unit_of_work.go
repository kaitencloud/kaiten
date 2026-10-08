// Package uow provides the transaction boundary every write use case runs
// its multi-statement work inside. Transact is context-based end to end: a
// use case composed inside another use case's own Transact call
// transparently joins that transaction instead of opening a second one, and
// its own code cannot tell the difference. There is no separate
// "composable" method and no exported helper a caller threads a transaction
// handle through by hand -- calling Transact is calling Transact, whether
// standalone or nested inside someone else's orchestration.
//
// UnitOfWork hands out a DBTX rather than a concrete query client: every
// module owns its own generated sqlc package, each with a structurally
// identical DBTX interface (Exec/Query/QueryRow), so a *pgx.Tx or
// *pgxpool.Pool obtained here binds directly to any module's own
// New(db DBTX) constructor without this package -- or any module -- naming
// another module's generated types. Ambient is a third such handle, for a
// dependency graph wired once at startup that has to follow whatever
// transaction its caller happens to be in.
package uow

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/trace"
)

// tracerName is the instrumentation scope for the transaction span. otelpgx
// times the individual statements; this one times the boundary they commit
// in, which is the part a pool-exhaustion or lock-contention incident is
// actually about.
const tracerName = "kaiten.uow"

// DBTX is the query-execution surface every module's generated sqlc Queries
// type binds to. It is structurally (not nominally) identical to the DBTX
// interface sqlc generates in each module's own package, so a value
// satisfying this one -- a *pgxpool.Pool or the *pgx.Tx this package hands
// out inside Transact -- satisfies theirs too.
type DBTX interface {
	Exec(context.Context, string, ...interface{}) (pgconn.CommandTag, error)
	Query(context.Context, string, ...interface{}) (pgx.Rows, error)
	QueryRow(context.Context, string, ...interface{}) pgx.Row
	CopyFrom(ctx context.Context, tableName pgx.Identifier, columnNames []string, rowSrc pgx.CopyFromSource) (int64, error)
}

type UnitOfWork struct {
	pool *pgxpool.Pool
}

func NewUnitOfWork(pool *pgxpool.Pool) *UnitOfWork {
	return &UnitOfWork{pool: pool}
}

type txDBTXKey struct{}

// Transact runs fn inside a database transaction, committing on success. A
// deferred rollback covers every non-commit exit path, including a panic
// unwinding through fn.
//
// If ctx already carries a transaction -- because Transact is already
// running somewhere up the call stack and this same ctx was passed down,
// directly or through another module's Execute call -- fn joins that
// transaction instead of opening a nested one: this call becomes a no-op
// wrapper that just runs fn. Only the outermost Transact call owns the
// BEGIN/COMMIT/ROLLBACK. This is how one module composes another module's
// public Execute (or any other exported entry point) into its own atomicity
// boundary: call Transact as usual, and call the other module's Execute
// with the ctx this closure received. Every repository resolved via
// DBTX(ctx) anywhere in that call graph -- however many different modules'
// use cases are involved, each binding the handle to its own generated
// Queries type -- shares the one transaction, with no caller touching a
// transaction handle or a context key directly. See
// integrations/upsertintegration (composing customers/createcustomer and
// customers/updatecustomer) for a real example.
func (u *UnitOfWork) Transact(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(txDBTXKey{}).(pgx.Tx); ok {
		return fn(ctx)
	}

	// Only the outermost call gets a span, for the same reason it is the
	// only one that gets a BEGIN: a joined nested call is a pass-through,
	// and timing it would just draw the same interval twice.
	ctx, span := otel.Tracer(tracerName).Start(ctx, "db.transaction", trace.WithSpanKind(trace.SpanKindInternal))
	defer span.End()

	tx, err := u.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		span.RecordError(err)
		return err
	}
	var committed bool
	defer func() {
		if !committed {
			// context.WithoutCancel because the most likely reason this
			// deferred rollback is running at all is that ctx was cancelled --
			// a client disconnect or a deadline. Issued on the dead context,
			// the ROLLBACK never reaches the server and pgxpool destroys the
			// connection on release rather than reusing it, which is exactly
			// the wrong thing to do during a cancellation storm. Matches
			// jit/provisioner.go and seeder/run.go.
			_ = tx.Rollback(context.WithoutCancel(ctx))
		}
	}()

	if err := fn(context.WithValue(ctx, txDBTXKey{}, tx)); err != nil {
		span.RecordError(err)
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		span.RecordError(err)
		return err
	}
	committed = true
	return nil
}

// DBTX returns the handle to use for ctx: the transaction-bound *pgx.Tx if
// ctx is inside a Transact call (including a joined, nested one), or the
// plain pool otherwise. Every module binds this to its own generated
// Queries type via that module's own New(...) constructor -- there is no
// separate "give me the transactional one" API, because from the caller's
// side there is no separate case to handle.
// InTransaction reports whether ctx carries a transaction a Transact call would
// join. Work that must only happen after a commit -- a call to the outside
// world about a row the transaction wrote -- asks it to tell whether the commit
// is its own to wait for, or its caller's.
func (u *UnitOfWork) InTransaction(ctx context.Context) bool {
	_, ok := ctx.Value(txDBTXKey{}).(pgx.Tx)
	return ok
}

func (u *UnitOfWork) DBTX(ctx context.Context) DBTX {
	if tx, ok := ctx.Value(txDBTXKey{}).(pgx.Tx); ok {
		return tx
	}
	return u.pool
}

// Ambient returns a DBTX that resolves itself on every call rather than at
// the moment it is handed out: each method looks up DBTX(ctx) for the ctx it
// was given and delegates to it. Bound once into a module's generated
// New(db DBTX) at wiring time, it makes that Queries value follow whatever
// transaction its caller is in -- the pool when there is none, the *pgx.Tx
// when there is -- with nothing at the call site saying which.
//
// This exists because a Queries built from the pool at startup CANNOT see an
// ambient transaction, and one of them running inside a Transact call
// acquires a SECOND pool connection to do its work. That is a self-deadlock,
// not a slow path: the CDC dispatcher wraps the inbox mark and the
// consumer's own work in one transaction, so a pool-bound consumer holds one
// connection and waits for another, and at MaxConns concurrent deliveries
// every connection in the pool is held by a transaction waiting for one
// more. Nothing times out and nothing errors -- consumption simply stops
// until the process restarts.
//
// The equivalent written by hand is db.New(uof.DBTX(ctx)) inside the method
// that needs it, which is what audittrail's subscriber does and is still the
// clearer choice for a consumer with one query in one place. Ambient is for
// the other shape: a dependency graph assembled at construction time, where
// threading a ctx back to every New(...) call would mean rebuilding the
// graph per delivery.
//
// Safe for concurrent use, and cheap: the returned value holds nothing but
// this UnitOfWork, and resolving is a context lookup.
func (u *UnitOfWork) Ambient() DBTX { return ambientDBTX{uof: u} }

type ambientDBTX struct{ uof *UnitOfWork }

func (a ambientDBTX) Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error) {
	return a.uof.DBTX(ctx).Exec(ctx, sql, args...)
}

func (a ambientDBTX) Query(ctx context.Context, sql string, args ...interface{}) (pgx.Rows, error) {
	return a.uof.DBTX(ctx).Query(ctx, sql, args...)
}

func (a ambientDBTX) QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row {
	return a.uof.DBTX(ctx).QueryRow(ctx, sql, args...)
}

func (a ambientDBTX) CopyFrom(ctx context.Context, tableName pgx.Identifier, columnNames []string, rowSrc pgx.CopyFromSource) (int64, error) {
	return a.uof.DBTX(ctx).CopyFrom(ctx, tableName, columnNames, rowSrc)
}
