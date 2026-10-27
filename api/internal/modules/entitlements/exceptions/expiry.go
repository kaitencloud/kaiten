package exceptions

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
)

// Expiry is billing-lifecycle step (g) (§16.2): each exception whose end
// passed, unrevoked, gets INSTANCE_ENTITLEMENT_EXCEPTION_EXPIRED once, with
// its expired_notified_at marker in the same transaction.
//
// Bookkeeping only: the view reads the window on every read, so the
// exception stopped applying at its endsAt whether or not this ran. It runs
// whether or not billing is enabled.
type Expiry struct {
	uof    *uow.UnitOfWork
	outbox *outbox.ScopedRepository
}

// NewExpiry returns the exception expiry notice.
func NewExpiry(uof *uow.UnitOfWork) *Expiry {
	return &Expiry{uof: uof, outbox: outbox.NewScopedRepository(uof)}
}

// Pass announces up to limit ended exceptions, each in its own transaction.
// One that fails is logged and left for the next pass. It also records the
// exceptions in force, by kind (§19.1).
func (e *Expiry) Pass(ctx context.Context, limit int) (announced int, err error) {
	q := db.New(e.uof.DBTX(ctx))
	now, err := Now(ctx, q)
	if err != nil {
		return 0, err
	}
	recordActive(ctx, q, now)
	ended, err := q.ListExpiredExceptions(ctx, db.ListExpiredExceptionsParams{
		Now: Timestamp(now), PageSize: int32(limit), //nolint:gosec // bounded by the batch size
	})
	if err != nil {
		return 0, err
	}
	for _, x := range ended {
		done, err := e.one(ctx, x.OrganizationID, x.ID)
		if err != nil {
			slog.ErrorContext(ctx, "entitlement exception expiry notice failed", "instance_entitlement_exception_id", x.ID, "error", err)
			continue
		}
		if done {
			announced++
		}
	}
	return announced, nil
}

// one marks and announces one exception; a panic fails that one only.
func (e *Expiry) one(ctx context.Context, organizationID, id uuid.UUID) (done bool, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panic announcing the expiry of exception %s: %v", id, r)
		}
	}()
	err = e.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(e.uof.DBTX(ctx))
		now, err := Now(ctx, q)
		if err != nil {
			return err
		}
		marked, err := q.MarkExceptionExpired(ctx, db.MarkExceptionExpiredParams{Now: Timestamp(now), OrganizationID: organizationID, ID: id})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		instance := Instance{ID: marked.ID, Slug: marked.Slug}
		list, err := List(ctx, q, organizationID, instance, &id, false, now)
		if err != nil || len(list) == 0 {
			return err
		}
		done = true
		return Emit(ctx, e.outbox, organizationID, instance.ID, events.InstanceEntitlementExceptionExpired, list[0])
	})
	return done, err
}

// activeGauge is kaiten.entitlements.exceptions.active.
var activeGauge = sync.OnceValue(func() metric.Int64Gauge {
	g, err := otel.GetMeterProvider().Meter("kaiten.entitlements").Int64Gauge("kaiten.entitlements.exceptions.active",
		metric.WithDescription("Entitlement exceptions in force, all organizations, by kind (SET, ADD, UNLIMITED)"), metric.WithUnit("{exception}"))
	if err != nil {
		slog.Warn("failed to register an entitlements metric", "metric", "kaiten.entitlements.exceptions.active", "error", err)
		return nil
	}
	return g
})

// recordActive records the exceptions in force at now, 0 for a kind without
// any; a failed read records nothing.
func recordActive(ctx context.Context, q *db.Queries, now time.Time) {
	g := activeGauge()
	if g == nil {
		return
	}
	rows, err := q.CountActiveExceptions(ctx, Timestamp(now))
	if err != nil {
		slog.WarnContext(ctx, "entitlement exceptions gauge not read", "error", err)
		return
	}
	counts := map[string]int64{KindSet: 0, KindAdd: 0, KindUnlimited: 0}
	for _, row := range rows {
		counts[string(row.Kind)] = row.Active
	}
	for kind, n := range counts {
		g.Record(ctx, n, metric.WithAttributes(attribute.String("kind", kind)))
	}
}
