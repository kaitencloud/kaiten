package redeemvoucher

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/telemetry"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// sessionOperation names the public redemption's refusals (§11.6).
const sessionOperation = "RedeemSessionVoucher"

// errDryRun rolls a dry run's transaction back once its result is read.
var errDryRun = errors.New("redeem: dry run")

// ForSession redeems a code a customer typed in its portal, on the instance
// its session is bound to (§11.6, V32-02): the redemption of Execute, on a
// live subscription only, with every refusal answered alike. The caller is
// the session's principal: the vendor user that minted it redeems.
//
// A subscription that is not live answers 409 .NoLiveSubscription, one a
// checkout still waits on 409 .SubscriptionIncomplete; every other refusal,
// whatever its reason, is 422 .VoucherInvalid with the same body, after the
// same queries. dryRun runs everything and writes nothing.
func (u *UseCase) ForSession(ctx context.Context, instanceSlug, code string, dryRun bool) (*catalogue.Redemption, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var redemption catalogue.Redemption
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		instance, err := q.GetInstanceForRedeem(ctx, db.GetInstanceForRedeemParams{OrganizationID: user.OrganizationID, Slug: instanceSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return noLiveSubscription() // the session's instance, deleted since
		}
		if err != nil {
			return err
		}
		state, err := q.GetRedeemSubscriptionState(ctx, db.GetRedeemSubscriptionStateParams{OrganizationID: user.OrganizationID, InstanceID: &instance.ID})
		switch {
		case errors.Is(err, pgx.ErrNoRows) || (err == nil && state.Status == "CANCELED"):
			return noLiveSubscription()
		case err != nil:
			return err
		case state.Status == "INCOMPLETE" || state.CheckoutPending:
			return kaitenerrors.Conflict(sessionOperation+".SubscriptionIncomplete",
				"a checkout waits for its payment: its own selection, voucher included, applies once paid")
		}

		// The same checks whether the code exists or not (§11.2 rule 6).
		candidate, err := catalogue.FindByCode(ctx, q, user.OrganizationID, code)
		if err != nil {
			return err
		}
		found := candidate != nil
		if !found {
			candidate = &catalogue.Candidate{Row: db.ListVouchersRow{}, Entitlements: nil, Grants: nil}
		}
		now, err := catalogue.Now(ctx, q)
		if err != nil {
			return err
		}
		window := candidate.Window(now)
		refusal, err := candidate.Instance(ctx, q, user.OrganizationID, instance)
		if err != nil {
			return err
		}
		if !found || window != nil || refusal != nil {
			return voucherInvalid()
		}
		claimed, err := q.ClaimRedemption(ctx, db.ClaimRedemptionParams{
			Now: timestamp(now), UserID: user.ID, ID: candidate.Row.ID, OrganizationID: user.OrganizationID,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return voucherInvalid()
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
			return voucherInvalid()
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
		if dryRun {
			return errDryRun
		}
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
	if errors.Is(err, errDryRun) {
		return &redemption, nil
	}
	if err != nil {
		return nil, err
	}
	telemetry.Redeemed(ctx, redemption.VoucherType)
	return &redemption, nil
}

func noLiveSubscription() error {
	return kaitenerrors.Conflict(sessionOperation+".NoLiveSubscription",
		"the instance has no live subscription: a checkout starts one")
}

func voucherInvalid() error {
	return kaitenerrors.UnprocessableEntity(sessionOperation+".VoucherInvalid", "this code cannot be redeemed")
}
