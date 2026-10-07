package validatevoucher

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// VoucherCheck is a code to check, for an instance when one is named.
type VoucherCheck struct {
	Code         string  `json:"code" minLength:"1" maxLength:"64" example:"SUMMER-2026-LAUNCH"`
	InstanceSlug *string `json:"instanceSlug,omitempty" doc:"Also run the checks that need the redeeming instance"`
}

// Validity is whether a code would redeem, and why not.
type Validity struct {
	Valid   bool               `json:"valid"`
	Reason  *string            `json:"reason,omitempty" enum:"NOT_FOUND,NOT_ACTIVE,NOT_YET_VALID,EXPIRED,EXHAUSTED,ALREADY_REDEEMED,NOT_ELIGIBLE,CURRENCY_MISMATCH" doc:"The first failing check"`
	Rule    *string            `json:"rule,omitempty" enum:"RESTRICTED_CUSTOMER,LICENSE_NOT_APPLICABLE,ADDON_NOT_APPLICABLE,FIRST_TIME_ONLY,ANNUAL_ONLY,MINIMUM_SUBSCRIPTION_AMOUNT,NOTHING_TO_BOOST" doc:"With NOT_ELIGIBLE: the eligibility rule"`
	Voucher *catalogue.Voucher `json:"voucher,omitempty" doc:"The voucher, without its code, when the code names one"`
}

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute runs the redemption checks without redeeming.
func (u *UseCase) Execute(ctx context.Context, check VoucherCheck) (*Validity, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
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
	if check.InstanceSlug != nil {
		instance, err := q.GetInstanceForRedeem(ctx, db.GetInstanceForRedeemParams{OrganizationID: user.OrganizationID, Slug: *check.InstanceSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFoundf("ValidateVoucher.InstanceNotFound", "instance %q not found", *check.InstanceSlug)
		}
		if err != nil {
			return nil, err
		}
		refusal, err := candidate.Instance(ctx, q, user.OrganizationID, instance)
		if err != nil {
			return nil, err
		}
		if refusal != nil {
			return refused(*refusal, &voucher), nil
		}
	}
	return &Validity{Valid: true, Reason: nil, Rule: nil, Voucher: &voucher}, nil
}

func refused(r catalogue.Refusal, voucher *catalogue.Voucher) *Validity {
	v := &Validity{Valid: false, Reason: &r.Reason, Rule: nil, Voucher: voucher}
	if r.Rule != "" {
		v.Rule = &r.Rule
	}
	return v
}
