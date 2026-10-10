package redeemvoucher

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/telemetry"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "RedeemVoucher"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute redeems the voucher a code names for an instance, in one
// transaction: the checks, the conditional increment of the voucher's count,
// and the redemption.
func (u *UseCase) Execute(ctx context.Context, instanceSlug, code string) (*catalogue.Redemption, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var redemption catalogue.Redemption
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		instance, err := q.GetInstanceForRedeem(ctx, db.GetInstanceForRedeemParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf(operation+".InstanceNotFound", "instance %q not found", instanceSlug)
		}
		if err != nil {
			return err
		}
		candidate, err := catalogue.FindByCode(ctx, q, user.OrganizationID, code)
		if err != nil {
			return err
		}
		if candidate == nil {
			return catalogue.Refusal{Reason: catalogue.ReasonNotFound, Rule: ""}.Error(operation)
		}
		now, err := catalogue.Now(ctx, q)
		if err != nil {
			return err
		}
		if refusal := candidate.Window(now); refusal != nil {
			return refusal.Error(operation)
		}
		refusal, err := candidate.Instance(ctx, q, user.OrganizationID, instance)
		if err != nil {
			return err
		}
		if refusal != nil {
			return refusal.Error(operation)
		}
		claimed, err := q.ClaimRedemption(ctx, db.ClaimRedemptionParams{
			Now: timestamp(now), UserID: user.ID, ID: candidate.Row.ID, OrganizationID: user.OrganizationID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			// A concurrent redemption took the last unit, or the voucher moved.
			return catalogue.Refusal{Reason: catalogue.ReasonExhausted, Rule: ""}.Error(operation)
		}
		if err != nil {
			return err
		}
		expires, err := u.boostEnd(ctx, q, candidate.Row, user.OrganizationID, instance.ID, now)
		if err != nil {
			return err
		}
		id, err := q.InsertInstanceVoucher(ctx, db.InsertInstanceVoucherParams{
			OrganizationID: user.OrganizationID, InstanceID: instance.ID, VoucherID: candidate.Row.ID, Now: timestamp(now),
			UserID: user.ID, EffectiveExpiresAt: expires,
		})
		if kaitenerrors.IsUniqueViolationOnConstraint(err, "instance_voucher_instance_id_voucher_id_key") {
			return catalogue.Refusal{Reason: catalogue.ReasonAlreadyRedeemed, Rule: ""}.Error(operation)
		}
		if err != nil {
			return err
		}
		list, err := catalogue.Redemptions(ctx, q, db.ListRedemptionsParams{
			OrganizationID: user.OrganizationID, InstanceID: nil, VoucherID: nil, ID: &id, Status: nil,
			CursorAt: pgtype.Timestamp{}, CursorID: nil, RowLimit: nil,
		})
		if err != nil {
			return err
		}
		redemption = list[0]
		if err := u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
			events.InstanceVoucherRedeemed.Name, events.InstanceVoucherRedeemed.Type, redemption, nil)); err != nil {
			return err
		}
		if claimed.Status == db.VoucherStatusEXHAUSTED {
			return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
				events.VoucherExhausted.Name, events.VoucherExhausted.Type,
				catalogue.ExhaustedEvent{ID: candidate.Row.ID, Name: candidate.Row.Name, MaxRedemptions: candidate.Row.MaxRedemptions}, nil))
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	telemetry.Redeemed(ctx, redemption.VoucherType)
	return &redemption, nil
}

// boostEnd is when a boost redeemed now stops applying: its duration in the
// instance's billing periods (a calendar month without a live subscription);
// never for FOREVER, and never for a PRICE voucher, counted in invoices.
func (u *UseCase) boostEnd(ctx context.Context, q *db.Queries, voucher db.ListVouchersRow, organizationID, instanceID uuid.UUID, now time.Time) (pgtype.Timestamp, error) {
	if voucher.VoucherType != db.VoucherTypeENTITLEMENTBOOST || voucher.Duration == db.VoucherDurationFOREVER {
		return pgtype.Timestamp{}, nil
	}
	months := 1
	sub, err := q.GetRedeemSubscription(ctx, db.GetRedeemSubscriptionParams{OrganizationID: organizationID, InstanceID: &instanceID})
	switch {
	case err == nil:
		months = rating.PeriodMonths(string(sub.BillingPeriod))
	case !errors.Is(err, pgx.ErrNoRows):
		return pgtype.Timestamp{}, err
	}
	periods := 1
	if voucher.Duration == db.VoucherDurationREPEATING && voucher.DurationInPeriods != nil {
		periods = int(*voucher.DurationInPeriods)
	}
	return timestamp(rating.AddMonthsClamped(now, months*periods)), nil
}

func timestamp(t time.Time) pgtype.Timestamp {
	return pgtype.Timestamp{Time: t, Valid: true, InfinityModifier: pgtype.Finite}
}
