// Package redeemsessionvoucher is POST /public/session/vouchers/redeem
// (§11.6, V32-02): a customer redeems a code from its portal, on the instance
// its session is bound to, while that instance's subscription is live.
//
// The redemption is the vendor's (§11.4), on the session's instance, by the
// vendor principal that minted the session. The answers are opaque like
// validate's: every refusal of the code is the same 422 .VoucherInvalid;
// only the state of the session's own subscription is said. A PRICE voucher
// applies from the next invoice composed, a boost and a flag grant at once.
package redeemsessionvoucher

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	vouchercatalogue "github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "RedeemSessionVoucher"

// SessionRedeem is a code the customer typed in its portal.
type SessionRedeem struct {
	Code   string `json:"code" minLength:"1" maxLength:"64" doc:"The code as the customer typed it; case and separators do not matter" example:"SUMMER-2026-LAUNCH"`
	DryRun bool   `json:"dryRun,omitempty" doc:"Check, and answer the redemption the call would make, without making it; counts as one attempt"`
}

// Session is the customer session that redeems.
type Session struct {
	SessionID    uuid.UUID
	CustomerID   uuid.UUID
	InstanceSlug *string
}

// The vouchers module's operations, through ports this module owns.
type (
	Limiter interface {
		LimitSession(ctx context.Context, sessionID, customerID uuid.UUID) error
	}
	Redeemer interface {
		ForSession(ctx context.Context, instanceSlug, code string, dryRun bool) (*vouchercatalogue.Redemption, error)
	}
)

type UseCase struct {
	limit  Limiter
	redeem Redeemer
}

func NewUseCase(limit Limiter, redeem Redeemer) *UseCase {
	return &UseCase{limit: limit, redeem: redeem}
}

// Execute redeems the code on the session's instance; created is false for a
// dryRun. The preconditions run in the order of §11.6: the rate limit, the
// bound session, the live subscription, then the code.
func (u *UseCase) Execute(ctx context.Context, session Session, request SessionRedeem) (redemption *sessions.SessionRedemption, created bool, err error) {
	if err := u.limit.LimitSession(ctx, session.SessionID, session.CustomerID); err != nil {
		return nil, false, sessions.Rename(err, "ValidateVoucher", operation)
	}
	if session.InstanceSlug == nil {
		return nil, false, kaitenerrors.UnprocessableEntity(operation+".InstanceRequired",
			"this session is bound to the customer only: a code is redeemed on an instance")
	}
	redeemed, err := u.redeem.ForSession(ctx, *session.InstanceSlug, request.Code, request.DryRun)
	if err != nil {
		return nil, false, err
	}
	shown := sessions.RedemptionFrom(*redeemed)
	return &shown, !request.DryRun, nil
}
