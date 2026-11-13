package instances

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

// startAIMaintenance closes expired reservations without moving money. Workers
// stay registered while AI is off. The expiry sweep never asks the flag: a hold
// that exists is closed on time whatever the rollout says, since commits are
// accepted while off. Only the open-holds gauge resolves the per-org flag.
func startAIMaintenance(svc services.Container) {
	if !svc.BackgroundWorkers || svc.Pool == nil || svc.PlatformFlags == nil {
		return
	}
	policy := aiusage.Policy{Flags: svc.PlatformFlags}
	expiredMetric, _ := otel.Meter("kaiten.ai_usage").Int64Counter("ai_credit_holds_expired_total")
	openMetric, _ := otel.Meter("kaiten.ai_usage").Int64ObservableGauge("ai_credit_holds_open")
	registration, err := otel.Meter("kaiten.ai_usage").RegisterCallback(func(ctx context.Context, observer metric.Observer) error {
		var total int64
		admitted := false
		err := enabledAIOrganizations(ctx, svc.Pool, policy, func(ctx context.Context, org uuid.UUID) error {
			var count int64
			if err := svc.Pool.QueryRow(ctx, `SELECT count(*) FROM ai_inference WHERE organization_id=$1 AND status='RESERVED' AND expires_at>(clock_timestamp() AT TIME ZONE 'UTC')`, org).Scan(&count); err != nil {
				return err
			}
			total += count
			admitted = true
			return nil
		})
		if err == nil && admitted {
			observer.ObserveInt64(openMetric, total)
		}
		return err
	}, openMetric)
	if err == nil {
		svc.WorkerRegistry.OnStop(func() { _ = registration.Unregister() })
	}
	// The flag reader uses its own pool connection. Elect on a dedicated
	// connection, as billing does, so a one-connection pool cannot self-deadlock.
	job := sweep.NewPoolPass("ai-credit-maintenance", svc.Pool, 20261019000000, sweep.Config{InitialDelay: time.Minute, Interval: time.Minute}, func(ctx context.Context) error {
		expired, err := ExpireAIReservations(ctx, svc.Pool)
		if expiredMetric != nil {
			expiredMetric.Add(ctx, expired)
		}
		return err
	})
	svc.WorkerRegistry.OnStop(job.Stop)
	job.Start(context.Background())
}

const (
	aiExpiryBatch      = 1000
	aiExpiryMaxBatches = 50
)

type aiReservationStore interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

// ExpireAIReservations marks overdue holds EXPIRED, oldest first, for every
// organization at once and whatever its rollout flag says: expiry changes a
// status, never a balance, and no row is removed. It walks the partial index
// on expires_at in bounded batches, so a pass costs what is overdue, not the
// number of organizations. It returns how many holds it closed, also on error.
func ExpireAIReservations(ctx context.Context, store aiReservationStore) (int64, error) {
	var expired int64
	for range aiExpiryMaxBatches {
		result, err := store.Exec(ctx, `WITH overdue AS (
 SELECT organization_id, id FROM ai_inference WHERE status='RESERVED'
 AND expires_at <= (clock_timestamp() AT TIME ZONE 'UTC')
 ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED
) UPDATE ai_inference a SET status='EXPIRED' FROM overdue o WHERE a.organization_id=o.organization_id AND a.id=o.id`, aiExpiryBatch)
		if err != nil {
			return expired, err
		}
		expired += result.RowsAffected()
		if result.RowsAffected() < aiExpiryBatch {
			break
		}
	}
	return expired, nil
}

type organizationReader interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
}

// Enumeration reads no AI facts. Close rows before any flag evaluation: a
// remote/local source cannot run while a pool rowset holds its connection.
func enabledAIOrganizations(ctx context.Context, reader organizationReader, policy aiusage.Policy, run func(context.Context, uuid.UUID) error) error {
	rows, err := reader.Query(ctx, `SELECT id FROM organization ORDER BY id`)
	if err != nil {
		return err
	}
	organizations, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		return err
	}
	for _, org := range organizations {
		op := policy.Resolve(ctx, org)
		if !policy.Enabled(op) {
			continue
		}
		if err := run(op, org); err != nil {
			return err
		}
	}
	return nil
}
