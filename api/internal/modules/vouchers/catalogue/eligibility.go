package catalogue

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Reasons a voucher cannot be redeemed, and the eligibility rules behind
// NOT_ELIGIBLE, as validate answers them.
const (
	ReasonNotFound         = "NOT_FOUND"
	ReasonNotActive        = "NOT_ACTIVE"
	ReasonNotYetValid      = "NOT_YET_VALID"
	ReasonExpired          = "EXPIRED"
	ReasonExhausted        = "EXHAUSTED"
	ReasonAlreadyRedeemed  = "ALREADY_REDEEMED"
	ReasonNotEligible      = "NOT_ELIGIBLE"
	ReasonCurrencyMismatch = "CURRENCY_MISMATCH"

	RuleRestrictedCustomer = "RESTRICTED_CUSTOMER"
	RuleLicense            = "LICENSE_NOT_APPLICABLE"
	RuleAddon              = "ADDON_NOT_APPLICABLE"
	RuleFirstTimeOnly      = "FIRST_TIME_ONLY"
	RuleAnnualOnly         = "ANNUAL_ONLY"
	RuleMinimumAmount      = "MINIMUM_SUBSCRIPTION_AMOUNT"
	RuleNothingToBoost     = "NOTHING_TO_BOOST"
)

// Refusal is the first check a redemption fails.
type Refusal struct {
	Reason string
	Rule   string
}

// Candidate is a voucher as the redemption checks read it.
type Candidate struct {
	Row          db.ListVouchersRow
	Entitlements []uuid.UUID
}

// FindByCode reads the voucher a code names, with the entitlements a boost
// changes; nil when the organization has none.
func FindByCode(ctx context.Context, q *db.Queries, organizationID uuid.UUID, code string) (*Candidate, error) {
	rows, err := q.ListVouchers(ctx, db.ListVouchersParams{
		OrganizationID: organizationID, ID: nil, Code: &code, Status: nil, VoucherType: nil, CustomerSlug: nil,
	})
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	grants, err := q.ListVoucherGrants(ctx, db.ListVoucherGrantsParams{OrganizationID: organizationID, VoucherIds: []uuid.UUID{rows[0].ID}})
	if err != nil {
		return nil, err
	}
	candidate := &Candidate{Row: rows[0], Entitlements: nil}
	for _, g := range grants {
		candidate.Entitlements = append(candidate.Entitlements, g.EntitlementID)
	}
	return candidate, nil
}

// Window checks the voucher itself at now: active, started, not expired, not
// exhausted.
func (c Candidate) Window(now time.Time) *Refusal {
	row := c.Row
	switch {
	case row.Status == db.VoucherStatusEXHAUSTED ||
		(row.MaxRedemptions != nil && row.RedemptionsCount >= *row.MaxRedemptions):
		return &Refusal{Reason: ReasonExhausted, Rule: ""}
	case row.Status == db.VoucherStatusEXPIRED || (row.ExpiresAt.Valid && !row.ExpiresAt.Time.After(now)):
		return &Refusal{Reason: ReasonExpired, Rule: ""}
	case row.Status != db.VoucherStatusACTIVE:
		return &Refusal{Reason: ReasonNotActive, Rule: ""}
	case row.StartsAt.Valid && row.StartsAt.Time.After(now):
		return &Refusal{Reason: ReasonNotYetValid, Rule: ""}
	}
	return nil
}

// Instance runs the checks that need the redeeming instance, in order: the
// customer, the licence, the add-ons, the redemption rules, the currency, a
// boost's targets, and a previous redemption.
func (c Candidate) Instance(ctx context.Context, q *db.Queries, organizationID uuid.UUID, instance db.GetInstanceForRedeemRow) (*Refusal, error) {
	row := c.Row
	notEligible := func(rule string) *Refusal { return &Refusal{Reason: ReasonNotEligible, Rule: rule} }
	if row.RestrictedCustomerID != nil && *row.RestrictedCustomerID != instance.CustomerID {
		return notEligible(RuleRestrictedCustomer), nil
	}
	if len(row.ApplicableLicenseIds) > 0 && !slices.Contains(row.ApplicableLicenseIds, instance.LicenseID) {
		return notEligible(RuleLicense), nil
	}
	if len(row.ApplicableAddonIds) > 0 {
		holds, err := q.InstanceHoldsAnyAddon(ctx, db.InstanceHoldsAnyAddonParams{InstanceID: instance.ID, AddonIds: row.ApplicableAddonIds})
		if err != nil {
			return nil, err
		}
		if !holds {
			return notEligible(RuleAddon), nil
		}
	}
	sub, err := q.GetRedeemSubscription(ctx, db.GetRedeemSubscriptionParams{OrganizationID: organizationID, InstanceID: &instance.ID})
	live := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	var rules RedemptionRules
	_ = json.Unmarshal(row.RedemptionRules, &rules)
	if rules.FirstTimeOnly {
		paid, err := q.CustomerHasPaid(ctx, db.CustomerHasPaidParams{OrganizationID: organizationID, CustomerID: &instance.CustomerID})
		if err != nil {
			return nil, err
		}
		if paid {
			return notEligible(RuleFirstTimeOnly), nil
		}
	}
	if rules.AnnualOnly && (!live || sub.BillingPeriod != db.BillingPeriodANNUAL) {
		return notEligible(RuleAnnualOnly), nil
	}
	if m := rules.MinimumSubscriptionAmount; m != nil {
		floor, _ := decimal.NewFromString(m.UnitAmountDecimal)
		amount, _ := decimal.NewFromString(sub.BaseAmount)
		if !live || sub.BaseCurrency != m.Currency || amount.LessThan(floor) {
			return notEligible(RuleMinimumAmount), nil
		}
	}
	if live && row.PriceDiscountType != nil && *row.PriceDiscountType == db.PriceDiscountTypeFIXEDAMOUNT && row.Currency != sub.Currency {
		return &Refusal{Reason: ReasonCurrencyMismatch, Rule: ""}, nil
	}
	if row.VoucherType == db.VoucherTypeENTITLEMENTBOOST {
		boostable, err := q.InstanceHasBoostable(ctx, db.InstanceHasBoostableParams{InstanceID: instance.ID, EntitlementIds: c.Entitlements})
		if err != nil {
			return nil, err
		}
		if !boostable {
			return notEligible(RuleNothingToBoost), nil
		}
	}
	redeemed, err := q.InstanceRedeemed(ctx, db.InstanceRedeemedParams{InstanceID: instance.ID, VoucherID: row.ID})
	if err != nil {
		return nil, err
	}
	if redeemed {
		return &Refusal{Reason: ReasonAlreadyRedeemed, Rule: ""}, nil
	}
	return nil, nil
}

// Error is the redeem answer for a refusal.
func (r Refusal) Error(operation string) error {
	switch r.Reason {
	case ReasonNotFound:
		return kaitenerrors.NotFound(operation+".NotFound", "no voucher has this code")
	case ReasonNotActive:
		return kaitenerrors.UnprocessableEntity(operation+".NotActive", "the voucher is not active")
	case ReasonNotYetValid:
		return kaitenerrors.UnprocessableEntity(operation+".NotYetValid", "the voucher cannot be redeemed yet")
	case ReasonExpired:
		return kaitenerrors.UnprocessableEntity(operation+".Expired", "the voucher has expired")
	case ReasonExhausted:
		return kaitenerrors.UnprocessableEntity(operation+".Exhausted", "the voucher has been redeemed as many times as it can be")
	case ReasonCurrencyMismatch:
		return kaitenerrors.UnprocessableEntity(operation+".CurrencyMismatch", "the voucher's amount is in another currency than the subscription's")
	case ReasonAlreadyRedeemed:
		return kaitenerrors.Conflict(operation+".AlreadyRedeemed", "the instance already redeemed this voucher")
	default:
		return kaitenerrors.UnprocessableEntityWithErrors(operation+".NotEligible", "the instance is not eligible for this voucher",
			&kaitenerrors.ErrorDetail{Message: "eligibility rule", Location: "rule", Value: map[string]string{"rule": r.Rule}})
	}
}
