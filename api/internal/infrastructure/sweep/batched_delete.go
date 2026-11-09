package sweep

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// TxBeginner is what a BatchedDelete runs on: a pool, or the connection that
// holds a sweep's lock.
type TxBeginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// BatchStop says why a BatchedDelete stopped.
type BatchStop int

const (
	// BatchStopDrained: a short batch, so nothing was left to delete.
	BatchStopDrained BatchStop = iota
	// BatchStopCapped: MaxBatches ran full, so rows may remain.
	BatchStopCapped
	// BatchStopLockTimeout: a batch gave up on a lock, so rows may remain.
	BatchStopLockTimeout
	// BatchStopCancelled: the context ended between two batches.
	BatchStopCancelled
)

// BatchResult is what a BatchedDelete did: the rows of the batches that
// committed, and why it stopped.
type BatchResult struct {
	Deleted int64
	Stop    BatchStop
}

// BatchedDelete deletes rows in short batches, each its own transaction, so a
// backlog never holds locks or bloats WAL the way one long DELETE would.
type BatchedDelete struct {
	// BatchSize is the rows Delete removes at most; fewer means it is done.
	BatchSize int32
	// MaxBatches caps this run.
	MaxBatches int
	// LockTimeout keeps a batch from queueing behind a writer of the same
	// rows, as a PostgreSQL interval literal such as "1s".
	LockTimeout string
	// Pause separates two batches, so a long drain leaves room for autovacuum
	// and replication. 0 runs them back to back.
	Pause time.Duration
	// Delete runs one batch on tx and returns the rows it removed.
	Delete func(ctx context.Context, tx pgx.Tx) (int64, error)
}

// Run deletes until a batch comes back short, MaxBatches is reached, a batch
// times out on a lock or ctx ends. The first two and a lock timeout are not
// errors: BatchResult.Stop tells them apart.
func (d BatchedDelete) Run(ctx context.Context, db TxBeginner) (BatchResult, error) {
	var total int64
	for i := range d.MaxBatches {
		if i > 0 && !pause(ctx, d.Pause) {
			return BatchResult{Deleted: total, Stop: BatchStopCancelled}, nil
		}
		if ctx.Err() != nil {
			return BatchResult{Deleted: total, Stop: BatchStopCancelled}, nil
		}

		deleted, err := d.batch(ctx, db)
		total += deleted
		if err != nil {
			if IsLockTimeout(err) {
				return BatchResult{Deleted: total, Stop: BatchStopLockTimeout}, nil
			}
			return BatchResult{Deleted: total}, err
		}
		if deleted < int64(d.BatchSize) {
			return BatchResult{Deleted: total, Stop: BatchStopDrained}, nil
		}
	}
	return BatchResult{Deleted: total, Stop: BatchStopCapped}, nil
}

// batch answers 0 when the commit fails: the rows it deleted were rolled back.
func (d BatchedDelete) batch(ctx context.Context, db TxBeginner) (int64, error) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	if _, err := tx.Exec(ctx, `SET LOCAL lock_timeout = '`+d.LockTimeout+`'`); err != nil {
		return 0, err
	}
	deleted, err := d.Delete(ctx, tx)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return deleted, nil
}

// pause waits d, and answers false when ctx ended first.
func pause(ctx context.Context, d time.Duration) bool {
	if d <= 0 {
		return true
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

// IsLockTimeout recognises PostgreSQL's lock_not_available (55P03), the error
// SET LOCAL lock_timeout turns a wait into: an expected outcome of maintenance
// under load.
func IsLockTimeout(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "55P03"
}

// ParseRetentionTerm reads a licence's retention term, {"<key>": N} with N a
// whole number from 1 to maximum. Anything else is not a retention anybody
// configured, and answers false so that nothing is purged on its account.
func ParseRetentionTerm(raw json.RawMessage, key string, maximum int64) (int, bool) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		return 0, false
	}
	// A json.Number only for a JSON number: a quoted "30" decodes as a string.
	number, ok := value[key].(json.Number)
	if !ok {
		return 0, false
	}
	term, err := number.Int64()
	if err != nil || term < 1 || term > maximum {
		return 0, false
	}
	return int(term), true
}
