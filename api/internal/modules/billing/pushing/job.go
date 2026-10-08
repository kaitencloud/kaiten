package pushing

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
)

// lockID elects the replica that runs a pass: the version of the migration
// that brought the invoices, plus one, by the house convention.
const lockID int64 = 20261007000001

// NewJob is the billing-invoice-push job.
func NewJob(pool *pgxpool.Pool, pusher *Pusher, cfg sweep.Config) *sweep.Job {
	return sweep.NewPoolPass("billing-invoice-push", pool, lockID, cfg, func(ctx context.Context) error {
		pushed, err := pusher.Pass(ctx)
		if pushed > 0 {
			slog.InfoContext(ctx, "invoices pushed to their provider", "pushed", pushed)
		}
		return err
	})
}

func lifecycleNow(ctx context.Context, q *db.Queries) (time.Time, error) {
	return lifecycle.Now(ctx, q)
}
