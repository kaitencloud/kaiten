package syncing

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
)

// lockID elects the replica that runs a pass: the version of the migration
// that brought the sync state, by the house convention.
const lockID int64 = 20261011000000

// NewJob is the billing-provider-sync job.
func NewJob(pool *pgxpool.Pool, syncer *Syncer, cfg sweep.Config) *sweep.Job {
	return sweep.New("billing-provider-sync", pool, lockID, cfg, func(ctx context.Context, _ *pgxpool.Conn) error {
		return syncer.Pass(ctx)
	})
}
