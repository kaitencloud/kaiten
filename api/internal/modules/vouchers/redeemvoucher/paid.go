package redeemvoucher

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
)

// RedeemPaid records, inside the caller's transaction, the redemption an
// INCOMPLETE checkout's payment applies (§9.10 rule 3): under the id its
// ACTIVATION's DISCOUNT line names, by actorID, at the payment's instant,
// with instance.voucher.v1.redeemed. Nothing is re-validated and nothing
// refuses it (§24 #65): the count stops at max_redemptions, and an instance
// that redeemed the voucher meanwhile keeps that redemption. It answers
// whether the row was written, for the caller to count its application.
func (u *UseCase) RedeemPaid(ctx context.Context, organizationID, actorID uuid.UUID, instanceSlug string, id uuid.UUID, code string) (bool, error) {
	q := u.deps.Queries(ctx)
	instance, err := q.GetInstanceForRedeem(ctx, db.GetInstanceForRedeemParams{OrganizationID: organizationID, Slug: instanceSlug})
	if err != nil {
		return false, err
	}
	candidate, err := catalogue.FindByCode(ctx, q, organizationID, code)
	if err != nil {
		return false, err
	}
	if candidate == nil {
		slog.WarnContext(ctx, "paid checkout: the voucher it redeemed no longer exists", "instance_voucher_id", id)
		return false, nil
	}
	now, err := catalogue.Now(ctx, q)
	if err != nil {
		return false, err
	}
	expires, err := u.boostEnd(ctx, q, candidate.Row, organizationID, instance.ID, now)
	if err != nil {
		return false, err
	}
	written, err := q.InsertPaidInstanceVoucher(ctx, db.InsertPaidInstanceVoucherParams{
		ID: id, OrganizationID: organizationID, InstanceID: instance.ID, VoucherID: candidate.Row.ID, Now: timestamp(now),
		UserID: actorID, EffectiveExpiresAt: expires,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	claimed, err := q.ClaimPaidRedemption(ctx, db.ClaimPaidRedemptionParams{Now: timestamp(now), UserID: actorID, ID: candidate.Row.ID, OrganizationID: organizationID})
	if err != nil {
		return false, err
	}
	list, err := catalogue.Redemptions(ctx, q, db.ListRedemptionsParams{
		OrganizationID: organizationID, InstanceID: nil, VoucherID: nil, ID: &written, Status: nil,
		CursorAt: pgtype.Timestamp{}, CursorID: nil, RowLimit: nil,
	})
	if err != nil {
		return false, err
	}
	if err := u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID,
		events.InstanceVoucherRedeemed.Name, events.InstanceVoucherRedeemed.Type, list[0], nil)); err != nil {
		return false, err
	}
	if claimed.JustExhausted {
		if err := u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID,
			events.VoucherExhausted.Name, events.VoucherExhausted.Type,
			catalogue.ExhaustedEvent{ID: candidate.Row.ID, Name: candidate.Row.Name, MaxRedemptions: candidate.Row.MaxRedemptions}, nil)); err != nil {
			return false, err
		}
	}
	return true, nil
}
