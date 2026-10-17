// Package validatesessionvoucher is POST /public/session/vouchers/validate
// (§14.4): a customer checks a code it was given before checking out with it.
//
// The answer is opaque (§11.2 rule 6): a code that would apply gets a summary
// of what it gives, and every other code -- unknown, not active yet, expired,
// used up, reserved for another customer, not for this plan, already redeemed
// -- the same {valid: false}, after the same queries. Guessing is slowed by
// the limits the vouchers module enforces: 10 checks per 10 minutes per
// session, 30 an hour per customer. Redeeming happens at checkout.
package validatesessionvoucher

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/sessions"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/validatevoucher"
)

const (
	operation = "ValidateSessionVoucher"
	core      = "ValidateVoucher"
)

// SessionVoucherCheck is a code the customer typed.
type SessionVoucherCheck struct {
	Code           string     `json:"code" minLength:"1" maxLength:"64" doc:"The code as the customer typed it; case and separators do not matter" example:"SUMMER-2026-LAUNCH"`
	LicensePriceID *uuid.UUID `json:"licensePriceId,omitempty" doc:"The price the customer is about to check out: the checks that read the subscription read this price"`
}

// SessionVoucherValidity is whether the code would apply. Every reason it
// would not gets the same answer.
type SessionVoucherValidity struct {
	Valid   bool            `json:"valid"`
	Voucher *SessionVoucher `json:"voucher,omitempty" doc:"What the voucher gives, when valid. Never its code."`
}

// SessionVoucher is a voucher as the customer sees it.
type SessionVoucher struct {
	Name              string           `json:"name" example:"Summer launch"`
	VoucherType       string           `json:"voucherType" enum:"PRICE,ENTITLEMENT_BOOST"`
	Duration          string           `json:"duration" enum:"ONE_TIME,REPEATING,FOREVER" doc:"PRICE: how many invoices it discounts (one, durationInPeriods, or every one). ENTITLEMENT_BOOST: how long it lasts, in billing periods."`
	DurationInPeriods *int32           `json:"durationInPeriods,omitempty"`
	Discount          *SessionDiscount `json:"discount,omitempty" doc:"PRICE: what it takes off"`
	Boosts            []SessionBoost   `json:"boosts,omitempty" doc:"ENTITLEMENT_BOOST: what it raises"`
}

// SessionDiscount is what a PRICE voucher takes off.
type SessionDiscount struct {
	Type      string  `json:"type" enum:"PERCENTAGE,FIXED_AMOUNT"`
	Value     string  `json:"value" doc:"A percentage in (0, 100], or an amount in minor units of currency" example:"30"`
	Currency  *string `json:"currency,omitempty" doc:"The currency of a FIXED_AMOUNT discount" example:"EUR"`
	AppliesTo string  `json:"appliesTo" enum:"LICENSE_BASE,ADDONS,BOTH,SELECTED_PRICES"`
}

// SessionBoost is one entitlement an ENTITLEMENT_BOOST raises.
type SessionBoost struct {
	EntitlementSlug string  `json:"entitlementSlug" example:"tokens"`
	ModifierType    string  `json:"modifierType" enum:"SET,ADD,MULTIPLY,UNLIMITED"`
	ModifierValue   *string `json:"modifierValue,omitempty" doc:"Absent for UNLIMITED" example:"2"`
}

// Session is the customer session that checks.
type Session struct {
	SessionID    uuid.UUID
	CustomerID   uuid.UUID
	InstanceSlug *string
}

// Validator is the vouchers module's operation, through a port this module
// owns.
type Validator interface {
	Opaque(ctx context.Context, check validatevoucher.OpaqueCheck) (*catalogue.Voucher, error)
}

type UseCase struct{ validate Validator }

func NewUseCase(validate Validator) *UseCase { return &UseCase{validate: validate} }

// Execute checks the code for the session's customer, and its instance when
// the session is bound to one.
func (u *UseCase) Execute(ctx context.Context, session Session, request SessionVoucherCheck) (*SessionVoucherValidity, error) {
	voucher, err := u.validate.Opaque(ctx, validatevoucher.OpaqueCheck{
		Code: request.Code, SessionID: session.SessionID, CustomerID: session.CustomerID,
		InstanceSlug: session.InstanceSlug, LicensePriceID: request.LicensePriceID,
	})
	if err != nil {
		return nil, sessions.Rename(err, core, operation)
	}
	if voucher == nil {
		return &SessionVoucherValidity{Valid: false, Voucher: nil}, nil
	}
	return &SessionVoucherValidity{Valid: true, Voucher: summary(*voucher)}, nil
}

func summary(v catalogue.Voucher) *SessionVoucher {
	out := &SessionVoucher{
		Name: v.Name, VoucherType: v.VoucherType, Duration: v.Duration, DurationInPeriods: v.DurationInPeriods,
		Discount: nil, Boosts: nil,
	}
	if v.PriceDiscountType != nil && v.PriceDiscountValue != nil {
		out.Discount = &SessionDiscount{Type: *v.PriceDiscountType, Value: *v.PriceDiscountValue, Currency: v.Currency, AppliesTo: ""}
		if v.PriceAppliesTo != nil {
			out.Discount.AppliesTo = *v.PriceAppliesTo
		}
	}
	for _, g := range v.Grants {
		out.Boosts = append(out.Boosts, SessionBoost{EntitlementSlug: g.EntitlementSlug, ModifierType: g.ModifierType, ModifierValue: g.ModifierValue})
	}
	return out
}
