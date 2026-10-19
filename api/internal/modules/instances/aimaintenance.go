package instances

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"

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
	expiredMetric, _ := otel.Meter("kaiten.ai_usage").Int64Counter("ai_credit_holds_expired_total")
	openMetric, _ := otel.Meter("kaiten.ai_usage").Int64ObservableGauge("ai_credit_holds_open")
	registration, err := otel.Meter("kaiten.ai_usage").RegisterCallback(func(ctx context.Context, observer metric.Observer) error {
		var count int64
		if err := svc.Pool.QueryRow(ctx, `SELECT count(*) FROM ai_inference WHERE status='RESERVED' AND expires_at>(clock_timestamp() AT TIME ZONE 'UTC')`).Scan(&count); err != nil {
			return err
		}
		observer.ObserveInt64(openMetric, count)
		return nil
	}, openMetric)
	if err == nil {
		svc.WorkerRegistry.OnStop(func() { _ = registration.Unregister() })
	}
	job := sweep.New("ai-credit-maintenance", svc.Pool, 20261019000000, sweep.Config{InitialDelay: time.Minute, Interval: time.Minute}, func(ctx context.Context, conn *pgxpool.Conn) error {
		rows, err := db.New(conn).ExpireAIReservations(ctx)
		if err == nil && expiredMetric != nil {
			expiredMetric.Add(ctx, int64(len(rows)))
		}
		return err
	})
	svc.WorkerRegistry.OnStop(job.Stop)
	job.Start(context.Background())
}
