// Package expiry is the voucher bookkeeping of the billing-lifecycle job
// (§11.5, §16.2 (b)): an ACTIVE voucher past its expiresAt becomes EXPIRED,
// with VOUCHER_EXPIRED, and an ACTIVE redemption past its window -- a boost
// that ran its course -- becomes EXPIRED, with INSTANCE_VOUCHER_EXPIRED.
//
// Bookkeeping only. The effects never waited for it: redemption refuses an
// expired voucher by its date, and the effective view and the composer test
// windows on every read. A late pass changes when the status and the event
// appear, nothing else.
package expiry

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
)

// Expiry marks vouchers and redemptions EXPIRED.
type Expiry struct {
	uof    *uow.UnitOfWork
	outbox *outbox.ScopedRepository
}

// New returns the voucher expiry.
func New(uof *uow.UnitOfWork) *Expiry {
	return &Expiry{uof: uof, outbox: outbox.NewScopedRepository(uof)}
}

// Pass expires up to limit vouchers and up to limit redemptions, each in its
// own transaction, recorded under system:kaiten. One that fails is logged and
// left for the next pass.
func (e *Expiry) Pass(ctx context.Context, limit int) (expired int, err error) {
	q := db.New(e.uof.DBTX(ctx))
	clock, err := q.VoucherClock(ctx)
	if err != nil {
		return 0, err
	}
	now := timestamp(clock.Time)
	pageSize := int32(limit) //nolint:gosec // bounded by the batch size

	vouchers, err := q.ListExpiringVouchers(ctx, db.ListExpiringVouchersParams{Now: now, PageSize: pageSize})
	if err != nil {
		return 0, err
	}
	for _, v := range vouchers {
		done, err := e.unit(ctx, v.ID, func(ctx context.Context, q *db.Queries) (bool, error) {
			return e.voucher(ctx, q, v.OrganizationID, v.ID, now)
		})
		if err != nil {
			slog.ErrorContext(ctx, "voucher expiry failed", "voucher_id", v.ID, "error", err)
			continue
		}
		if done {
			expired++
		}
	}

	redemptions, err := q.ListExpiringRedemptions(ctx, db.ListExpiringRedemptionsParams{Now: now, PageSize: pageSize})
	if err != nil {
		return expired, err
	}
	for _, r := range redemptions {
		done, err := e.unit(ctx, r.ID, func(ctx context.Context, q *db.Queries) (bool, error) {
			return e.redemption(ctx, q, r.OrganizationID, r.ID, now)
		})
		if err != nil {
			slog.ErrorContext(ctx, "redemption expiry failed", "instance_voucher_id", r.ID, "error", err)
			continue
		}
		if done {
			expired++
		}
	}
	return expired, nil
}

// unit runs one expiry in its own transaction; a panic fails that unit only.
func (e *Expiry) unit(ctx context.Context, id uuid.UUID, work func(context.Context, *db.Queries) (bool, error)) (done bool, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("panic expiring %s: %v", id, r)
		}
	}()
	err = e.uof.Transact(ctx, func(ctx context.Context) error {
		done, err = work(ctx, db.New(e.uof.DBTX(ctx)))
		return err
	})
	return done, err
}

func (e *Expiry) voucher(ctx context.Context, q *db.Queries, organizationID, id uuid.UUID, now pgtype.Timestamp) (bool, error) {
	actor, err := q.GetVoucherSystemActor(ctx, db.GetVoucherSystemActorParams{OrganizationID: organizationID, ExternalID: platformidentity.ExternalID})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, fmt.Errorf("system:kaiten has no membership in organization %s", organizationID)
	}
	if err != nil {
		return false, err
	}
	row, err := q.ExpireVoucher(ctx, db.ExpireVoucherParams{Now: now, UserID: actor, OrganizationID: organizationID, ID: id})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, e.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID,
		events.VoucherExpired.Name, events.VoucherExpired.Type,
		catalogue.ExpiredEvent{ID: row.ID, Name: row.Name, ExpiresAt: row.ExpiresAt.Time.UTC()}, nil))
}

func (e *Expiry) redemption(ctx context.Context, q *db.Queries, organizationID, id uuid.UUID, now pgtype.Timestamp) (bool, error) {
	n, err := q.ExpireRedemption(ctx, db.ExpireRedemptionParams{Now: now, OrganizationID: organizationID, ID: id})
	if err != nil || n == 0 {
		return false, err
	}
	list, err := catalogue.Redemptions(ctx, q, db.ListRedemptionsParams{
		OrganizationID: organizationID, InstanceID: nil, VoucherID: nil, ID: &id, Status: nil,
	})
	if err != nil || len(list) == 0 {
		return false, err
	}
	return true, e.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID,
		events.InstanceVoucherExpired.Name, events.InstanceVoucherExpired.Type, list[0], nil))
}

func timestamp(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t.UTC(), InfinityModifier: pgtype.Finite, Valid: true}
}
