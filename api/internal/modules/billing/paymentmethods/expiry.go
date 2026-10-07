package paymentmethods

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
)

// Expiry watches saved payment methods expire, on the first lifecycle pass
// of each UTC day: CUSTOMER_PAYMENT_METHOD_EXPIRING once, 30 days before
// the last day of the expiry month; after that day the method is EXPIRED,
// with no further event. Day-granular, without a durable marker (§24 #8):
// a restart on the same day may announce that day's expiries again.
type Expiry struct {
	uof    *uow.UnitOfWork
	outbox *outbox.ScopedRepository

	mu   sync.Mutex
	last time.Time // the last UTC day handled
}

// NewExpiry returns the expiry watch.
func NewExpiry(uof *uow.UnitOfWork) *Expiry {
	return &Expiry{uof: uof, outbox: outbox.NewScopedRepository(uof)}
}

// Pass handles today (the database's clock), once.
func (e *Expiry) Pass(ctx context.Context) (int, error) {
	clock, err := db.New(e.uof.DBTX(ctx)).BillingClock(ctx)
	if err != nil {
		return 0, err
	}
	return e.PassAt(ctx, clock.Time.UTC())
}

// PassAt handles now's UTC day, once.
func (e *Expiry) PassAt(ctx context.Context, now time.Time) (announced int, err error) {
	now = now.UTC()
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	e.mu.Lock()
	done := !e.last.Before(day)
	e.mu.Unlock()
	if done {
		return 0, nil
	}
	err = e.uof.Transact(ctx, func(ctx context.Context) error {
		q := db.New(e.uof.DBTX(ctx))
		expiring, err := q.ListExpiringPaymentMethods(ctx, pgtype.Date{Time: day, InfinityModifier: pgtype.Finite, Valid: true})
		if err != nil {
			return err
		}
		for _, row := range expiring {
			end := time.Date(int(*row.PaymentMethodExpYear), time.Month(*row.PaymentMethodExpMonth)+1, 1, 0, 0, 0, 0, time.UTC).Add(-time.Millisecond)
			if err := e.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(row.OrganizationID,
				events.CustomerPaymentMethodExpiring.Name, events.CustomerPaymentMethodExpiring.Type, PaymentMethodExpiring{
					CustomerSlug: row.CustomerSlug, ProviderKind: string(row.ProviderKind), ExpiresAt: end,
				}, nil)); err != nil {
				return err
			}
			announced++
		}
		_, err = q.ExpirePaymentMethods(ctx, db.ExpirePaymentMethodsParams{Now: invoices.Timestamp(now), Day: pgtype.Date{Time: day, InfinityModifier: pgtype.Finite, Valid: true}})
		return err
	})
	if err != nil {
		return 0, err
	}
	e.mu.Lock()
	e.last = day
	e.mu.Unlock()
	return announced, nil
}
