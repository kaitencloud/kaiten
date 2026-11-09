package sweep

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeTx is the part of a transaction a BatchedDelete touches.
type fakeTx struct {
	pgx.Tx
	commitErr error
}

func (fakeTx) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	return pgconn.CommandTag{}, nil
}
func (f fakeTx) Commit(context.Context) error { return f.commitErr }
func (fakeTx) Rollback(context.Context) error { return nil }

type fakeBeginner struct{ tx fakeTx }

func (f fakeBeginner) Begin(context.Context) (pgx.Tx, error) { return f.tx, nil }

func deleteAnswering(answers ...any) func(context.Context, pgx.Tx) (int64, error) {
	i := 0
	return func(context.Context, pgx.Tx) (int64, error) {
		answer := answers[i]
		i++
		if err, ok := answer.(error); ok {
			return 0, err
		}
		return int64(answer.(int)), nil
	}
}

func TestBatchedDeleteStops(t *testing.T) {
	t.Parallel()
	lockTimeout := &pgconn.PgError{Code: "55P03"}

	cases := []struct {
		name    string
		answers []any
		deleted int64
		stop    BatchStop
	}{
		{name: "a short batch has drained it", answers: []any{10, 10, 3}, deleted: 23, stop: BatchStopDrained},
		{name: "full batches up to the cap may leave rows", answers: []any{10, 10, 10}, deleted: 30, stop: BatchStopCapped},
		{name: "a lock timeout keeps what committed", answers: []any{10, lockTimeout}, deleted: 10, stop: BatchStopLockTimeout},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			result, err := BatchedDelete{BatchSize: 10, MaxBatches: 3, LockTimeout: "1s", Delete: deleteAnswering(tc.answers...)}.
				Run(t.Context(), fakeBeginner{})
			require.NoError(t, err)
			assert.Equal(t, BatchResult{Deleted: tc.deleted, Stop: tc.stop}, result)
		})
	}
}

func TestBatchedDeleteCountsNothingOfAFailedCommit(t *testing.T) {
	t.Parallel()
	commitErr := errors.New("connection lost")

	result, err := BatchedDelete{BatchSize: 10, MaxBatches: 3, LockTimeout: "1s", Delete: deleteAnswering(10)}.
		Run(t.Context(), fakeBeginner{tx: fakeTx{commitErr: commitErr}})

	require.ErrorIs(t, err, commitErr)
	assert.Zero(t, result.Deleted, "a batch that did not commit deleted nothing")
}

func TestBatchedDeleteStopsWhenCancelled(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	result, err := BatchedDelete{BatchSize: 10, MaxBatches: 3, LockTimeout: "1s", Delete: deleteAnswering()}.
		Run(ctx, fakeBeginner{})

	require.NoError(t, err)
	assert.Equal(t, BatchResult{Stop: BatchStopCancelled}, result)
}

func TestParseRetentionTerm(t *testing.T) {
	t.Parallel()

	days, ok := ParseRetentionTerm([]byte(`{"days": 30}`), "days", 100)
	require.True(t, ok)
	assert.Equal(t, 30, days)

	_, ok = ParseRetentionTerm([]byte(`{"days": 30}`), "months", 100)
	assert.False(t, ok, "another key is not this term")

	_, ok = ParseRetentionTerm([]byte(`{"days": 101}`), "days", 100)
	assert.False(t, ok, "above the maximum")
}
