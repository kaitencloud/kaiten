package validatevoucher

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/telemetry"
	"github.com/kaitencloud/kaiten/api/internal/shared/ratelimit"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "ValidateVoucher"

// Validation limits, per replica (§11.2 rule 5, §14.3). A code is a guessable
// secret only as far as guessing is slow: the vendor's backend may check 60
// codes a minute per credential; a customer's browser 10 per 10 minutes per
// session, and 30 an hour per customer however many sessions it mints.
var (
	tokenRate      = ratelimit.Every(60, time.Minute)
	tokenBurst     = 60
	sessionRate    = ratelimit.Every(10, 10*time.Minute)
	sessionBurst   = 10
	customerRate   = ratelimit.Every(30, time.Hour)
	customerBurst  = 30
	rateLimitedMsg = "too many voucher codes checked: try again later"
)

// VoucherCheck is a code to check, for an instance and a price when named.
type VoucherCheck struct {
	Code           string     `json:"code" minLength:"1" maxLength:"64" example:"SUMMER-2026-LAUNCH"`
	InstanceSlug   *string    `json:"instanceSlug,omitempty" doc:"Also run the checks that need the redeeming instance"`
	LicensePriceID *uuid.UUID `json:"licensePriceId,omitempty" doc:"The flat-fee price a subscription would start on: the licence, period, amount and currency checks read it instead of the instance's live subscription"`
}

// Validity is whether a code would redeem, and why not.
type Validity struct {
	Valid   bool               `json:"valid"`
	Reason  *string            `json:"reason,omitempty" enum:"NOT_FOUND,NOT_ACTIVE,NOT_YET_VALID,EXPIRED,EXHAUSTED,ALREADY_REDEEMED,NOT_ELIGIBLE,CURRENCY_MISMATCH" doc:"The first failing check"`
	Rule    *string            `json:"rule,omitempty" enum:"RESTRICTED_CUSTOMER,LICENSE_NOT_APPLICABLE,ADDON_NOT_APPLICABLE,FIRST_TIME_ONLY,ANNUAL_ONLY,MINIMUM_SUBSCRIPTION_AMOUNT,NOTHING_TO_BOOST" doc:"With NOT_ELIGIBLE: the eligibility rule"`
	Voucher *catalogue.Voucher `json:"voucher,omitempty" doc:"The voucher, without its code, when the code names one"`
}

// OpaqueCheck is a code a customer checks through its session (§14.4).
type OpaqueCheck struct {
	Code           string
	SessionID      uuid.UUID
	CustomerID     uuid.UUID
	InstanceSlug   *string
	LicensePriceID *uuid.UUID
}

type principalKey struct{ organizationID, userID uuid.UUID }

type UseCase struct {
	deps      catalogue.Deps
	tokens    *ratelimit.Keyed[principalKey]
	sessions  *ratelimit.Keyed[uuid.UUID]
	customers *ratelimit.Keyed[uuid.UUID]
	now       func() time.Time
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{
		deps:      deps,
		tokens:    ratelimit.New[principalKey](tokenRate, tokenBurst),
		sessions:  ratelimit.New[uuid.UUID](sessionRate, sessionBurst),
		customers: ratelimit.New[uuid.UUID](customerRate, customerBurst),
		now:       time.Now,
	}
}

// Execute runs the redemption checks without redeeming, and says which one
// fails. The limit is per principal: the user or service account a token
// authenticates.
func (u *UseCase) Execute(ctx context.Context, check VoucherCheck) (*Validity, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if err := u.limitPrincipal(ctx, user.OrganizationID, user.ID); err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	subject := catalogue.Subject{CustomerID: nil, Instance: nil, Plan: nil}
	if check.InstanceSlug != nil {
		instance, err := q.GetInstanceForRedeem(ctx, db.GetInstanceForRedeemParams{OrganizationID: user.OrganizationID, Slug: *check.InstanceSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFoundf(operation+".InstanceNotFound", "instance %q not found", *check.InstanceSlug)
		}
		if err != nil {
			return nil, err
		}
		subject.CustomerID, subject.Instance = &instance.CustomerID, &instance
	}
	if check.LicensePriceID != nil {
		plan, err := q.GetPlanPrice(ctx, db.GetPlanPriceParams{OrganizationID: user.OrganizationID, ID: *check.LicensePriceID})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFoundf(operation+".PriceNotFound", "no flat-fee licence price %s", *check.LicensePriceID)
		}
		if err != nil {
			return nil, err
		}
		subject.Plan = &plan
	}

	candidate, err := catalogue.FindByCode(ctx, q, user.OrganizationID, check.Code)
	if err != nil {
		return nil, err
	}
	if candidate == nil {
		return refused(catalogue.Refusal{Reason: catalogue.ReasonNotFound, Rule: ""}, nil), nil
	}
	voucher, err := catalogue.One(ctx, q, user.OrganizationID, &candidate.Row.ID, nil, false, nil)
	if err != nil {
		return nil, err
	}
	now, err := catalogue.Now(ctx, q)
	if err != nil {
		return nil, err
	}
	if refusal := candidate.Window(now); refusal != nil {
		return refused(*refusal, &voucher), nil
	}
	refusal, err := candidate.Check(ctx, q, user.OrganizationID, subject)
	if err != nil {
		return nil, err
	}
	if refusal != nil {
		return refused(*refusal, &voucher), nil
	}
	return &Validity{Valid: true, Reason: nil, Rule: nil, Voucher: &voucher}, nil
}

// Opaque is the customer's own check (§11.2 rule 6, §14.4): the voucher when
// the code would redeem for the session's customer -- and its instance and the
// price, when known -- and nil whatever else is the case. Every code runs the
// same queries, so neither the answer nor its timing tells an unknown code
// from an exhausted, reserved or ineligible one.
func (u *UseCase) Opaque(ctx context.Context, check OpaqueCheck) (*catalogue.Voucher, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	if err := u.limitSession(ctx, check.SessionID, check.CustomerID); err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	customerID := check.CustomerID
	subject := catalogue.Subject{CustomerID: &customerID, Instance: nil, Plan: nil}
	known := true
	if check.InstanceSlug != nil {
		instance, err := q.GetInstanceForRedeem(ctx, db.GetInstanceForRedeemParams{OrganizationID: user.OrganizationID, Slug: *check.InstanceSlug})
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			// The session's instance, deleted since the session was minted.
			known = false
		case err != nil:
			return nil, err
		default:
			subject.Instance = &instance
		}
	}
	if check.LicensePriceID != nil {
		plan, err := q.GetPlanPrice(ctx, db.GetPlanPriceParams{OrganizationID: user.OrganizationID, ID: *check.LicensePriceID})
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			known = false
		case err != nil:
			return nil, err
		case !plan.Active:
			known = false
		default:
			subject.Plan = &plan
		}
	}

	candidate, err := catalogue.FindByCode(ctx, q, user.OrganizationID, check.Code)
	if err != nil {
		return nil, err
	}
	found := candidate != nil
	if !found {
		candidate = &catalogue.Candidate{Row: db.ListVouchersRow{}, Entitlements: nil, Grants: nil}
	}
	clock, err := catalogue.Now(ctx, q)
	if err != nil {
		return nil, err
	}
	window := candidate.Window(clock)
	refusal, err := candidate.Check(ctx, q, user.OrganizationID, subject)
	if err != nil {
		return nil, err
	}
	if !found || !known || window != nil || refusal != nil {
		return nil, nil
	}
	voucher := catalogue.ToVoucher(candidate.Row, candidate.Grants, false)
	return &voucher, nil
}

// limitPrincipal takes one of the checks a principal -- the user or service
// account a token authenticates -- may make (60 a minute).
func (u *UseCase) limitPrincipal(ctx context.Context, organizationID, userID uuid.UUID) error {
	if wait, ok := u.tokens.Allow(principalKey{organizationID, userID}, u.now()); !ok {
		telemetry.RateLimited(ctx, telemetry.SurfaceCore)
		return kaitenerrors.TooManyRequests(operation+".RateLimited", rateLimitedMsg, wait)
	}
	return nil
}

// limitSession takes one of the checks a session may make (10 per 10 minutes)
// and one of its customer's (30 an hour), or neither.
func (u *UseCase) limitSession(ctx context.Context, sessionID, customerID uuid.UUID) error {
	now := u.now()
	if wait, ok := ratelimit.All(u.sessions.Reserve(sessionID, now), u.customers.Reserve(customerID, now)); !ok {
		telemetry.RateLimited(ctx, telemetry.SurfacePublic)
		return kaitenerrors.TooManyRequests(operation+".RateLimited", rateLimitedMsg, wait)
	}
	return nil
}

func refused(r catalogue.Refusal, voucher *catalogue.Voucher) *Validity {
	v := &Validity{Valid: false, Reason: &r.Reason, Rule: nil, Voucher: voucher}
	if r.Rule != "" {
		v.Rule = &r.Rule
	}
	return v
}
