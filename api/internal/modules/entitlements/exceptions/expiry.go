package exceptions

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

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
// One that fails is logged and left for the next pass.
func (e *Expiry) Pass(ctx context.Context, limit int) (announced int, err error) {
	q := db.New(e.uof.DBTX(ctx))
	now, err := Now(ctx, q)
	if err != nil {
		return 0, err
	}
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
