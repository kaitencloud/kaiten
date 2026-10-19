package instances

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

// startAIMaintenance closes expired reservations without ever moving money.
// The request gate ignores them immediately; the sweep only updates bookkeeping.
func startAIMaintenance(svc services.Container) {
	if !svc.BackgroundWorkers || svc.Pool == nil {
		return
	}
	job := sweep.New("ai-credit-maintenance", svc.Pool, 20261019000000, sweep.Config{InitialDelay: time.Minute, Interval: time.Minute}, func(ctx context.Context, conn *pgxpool.Conn) error {
		_, err := db.New(conn).ExpireAIReservations(ctx)
		return err
	})
	svc.WorkerRegistry.OnStop(job.Stop)
	job.Start(context.Background())
}
