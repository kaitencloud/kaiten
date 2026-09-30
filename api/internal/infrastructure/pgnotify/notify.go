package pgnotify

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/pgnotify/db"
)

// DBTX is the raw connection/transaction handle Publish issues NOTIFY
// through. It is structurally identical to uow.DBTX (and to every module's
// own generated DBTX interface), so callers pass a *pgxpool.Pool or the
// *pgx.Tx obtained from uow.UnitOfWork.DBTX(ctx) directly -- Publish builds
// its own package-local Queries from it, rather than requiring the caller
// to already hold one.
type DBTX = db.DBTX

// Publish issues a Postgres NOTIFY on channel with payload, through dbtx.
//
// If dbtx is transaction-scoped -- i.e. obtained via uow.DBTX(ctx) inside a
// call to (*uow.UnitOfWork).Transact -- Postgres queues the notification
// and only delivers it to LISTEN-ing connections once that transaction
// commits, and silently discards it if the transaction rolls back instead.
// That is native PostgreSQL behaviour for NOTIFY issued inside a
// transaction, so callers get "don't signal something that didn't really
// happen" for free, the same principle this project's outbox pattern
// enforces by hand for its own, heavier delivery guarantees (see
// internal/infrastructure/outbox). If dbtx is pool-backed (not inside a
// Transact call), the NOTIFY is its own implicit, already-committed
// statement -- correct as long as callers publish after their own write
// has committed, exactly like validator.InvalidateCache and
// deletetokenonserviceaccount already do for their local cache deletes.
func Publish(ctx context.Context, dbtx DBTX, channel, payload string) error {
	return db.New(dbtx).Notify(ctx, db.NotifyParams{Channel: channel, Payload: payload})
}
