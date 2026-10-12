// Package sweep_test proves internal/infrastructure/sweep against a real
// PostgreSQL server: the election is a session advisory lock, and what the
// package must never do -- wait on a pool it holds a connection of -- only shows
// with a real pool and a real server.
package sweep_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
)

// A pass that runs a query through the pool, as a billing pass runs its use
// cases through the unit of work.
func queryThroughPool(pool *pgxpool.Pool, ran *bool) sweep.PoolPass {
	return func(ctx context.Context) error {
		var one int
		if err := pool.QueryRow(ctx, `SELECT 1`).Scan(&one); err != nil {
			return err
		}
		*ran = true
		return nil
	}
}

func onePool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	config := testDb.DbPool.Config().Copy()
	config.MaxConns = 1
	pool, err := pgxpool.NewWithConfig(t.Context(), config)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	return pool
}

// The whole pool is the pass's: with a pool of one connection, a lock held on
// that connection would leave the pass waiting for it until the deadline. Held
// on a connection of its own, the pass runs.
func TestPoolPass_DoesNotHoldAConnectionOfThePool(t *testing.T) {
	pool := onePool(t)
	var ran bool
	job := sweep.NewPoolPass("pool-pass-test", pool, 20261008000001, sweep.Config{}, queryThroughPool(pool, &ran))

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Second)
	defer cancel()
	require.NoError(t, job.Sweep(ctx))
	assert.True(t, ran)
}

// Several jobs that start together each get their lock, one after the other,
// and none of them takes a connection the others' passes need.
func TestPoolPass_JobsTogetherOnASmallPool(t *testing.T) {
	pool := onePool(t)
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	errs := make(chan error, 4)
	for i := range 4 {
		var ran bool
		job := sweep.NewPoolPass("pool-pass-together", pool, 20261008000010+int64(i), sweep.Config{}, queryThroughPool(pool, &ran))
		go func() { errs <- job.Sweep(ctx) }()
	}
	for range 4 {
		require.NoError(t, <-errs)
	}
}

// The election still elects: while another session holds the lock, the pass is
// skipped, and that is not an error.
func TestPoolPass_SkipsWhileAnotherSessionHoldsTheLock(t *testing.T) {
	const lockID = 20261008000002
	holder, err := testDb.DbPool.Acquire(t.Context())
	require.NoError(t, err)
	defer holder.Release()
	_, err = holder.Exec(t.Context(), `SELECT pg_advisory_lock($1::bigint)`, int64(lockID))
	require.NoError(t, err)
	defer func() {
		_, _ = holder.Exec(context.Background(), `SELECT pg_advisory_unlock($1::bigint)`, int64(lockID))
	}()

	pool := onePool(t)
	var ran bool
	job := sweep.NewPoolPass("pool-pass-elected", pool, lockID, sweep.Config{}, queryThroughPool(pool, &ran))

	require.NoError(t, job.Sweep(t.Context()))
	assert.False(t, ran)
}

// The lock goes with the connection: once a pass is over, the next one is
// elected again.
func TestPoolPass_ReleasesTheLockAfterThePass(t *testing.T) {
	pool := onePool(t)
	var first, second bool
	const lockID = 20261008000003
	require.NoError(t, sweep.NewPoolPass("pool-pass-release", pool, lockID, sweep.Config{}, queryThroughPool(pool, &first)).Sweep(t.Context()))
	require.NoError(t, sweep.NewPoolPass("pool-pass-release", pool, lockID, sweep.Config{}, queryThroughPool(pool, &second)).Sweep(t.Context()))
	assert.True(t, first)
	assert.True(t, second)
}
