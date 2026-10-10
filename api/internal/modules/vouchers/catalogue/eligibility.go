package catalogue

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
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
	Grants       []Grant
}

// FindByCode reads the voucher a code names, with what a boost changes; nil
// when the organization has none. It runs the same two queries either way.
func FindByCode(ctx context.Context, q *db.Queries, organizationID uuid.UUID, code string) (*Candidate, error) {
	rows, err := q.ListVouchers(ctx, db.ListVouchersParams{
		OrganizationID: organizationID, ID: nil, Code: &code, Status: nil, VoucherType: nil, CustomerSlug: nil,
		CursorAt: pgtype.Timestamp{}, CursorID: nil, RowLimit: nil,
	})
	if err != nil {
		return nil, err
	}
	id := uuid.Nil
	if len(rows) > 0 {
		id = rows[0].ID
	}
	grants, err := q.ListVoucherGrants(ctx, db.ListVoucherGrantsParams{OrganizationID: organizationID, VoucherIds: []uuid.UUID{id}})
	if err != nil || len(rows) == 0 {
		return nil, err
	}
	candidate := &Candidate{Row: rows[0], Entitlements: nil, Grants: []Grant{}}
	for _, g := range grants {
		candidate.Entitlements = append(candidate.Entitlements, g.EntitlementID)
		grant := Grant{EntitlementSlug: g.EntitlementSlug, ModifierType: string(g.ModifierType), ModifierValue: nil}
		if g.ModifierValue != "" {
			value := formatDecimal(g.ModifierValue)
			grant.ModifierValue = &value
		}
		candidate.Grants = append(candidate.Grants, grant)
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

// Subject is who would redeem a voucher (§11.3): a customer, and the instance
// and the price of the subscription it would start, when known. A check that
// needs what the subject does not say is skipped.
type Subject struct {
	CustomerID *uuid.UUID
	Instance   *db.GetInstanceForRedeemRow
	// Plan is the price a subscription would start on. The period, amount and
	// currency checks read it rather than the instance's live subscription,
	// and the licence check its version: subscribing on it moves the instance
	// there (§14.4 rule 2).
	Plan *Plan
}

// Plan is a flat-fee price a subscription would start on.
type Plan = db.GetPlanPriceRow

// facts are what the checks of a subject read.
type facts struct {
	paid       bool
	holdsAddon bool
	sub        *db.GetRedeemSubscriptionRow
	boostable  bool
	redeemed   bool
}

// gather reads the facts with the same queries whatever the voucher says --
// only what the subject is decides which run -- so that an answer that hides
// why a code is refused hides it in its timing too (§11.2 rule 6).
func (c Candidate) gather(ctx context.Context, q *db.Queries, organizationID uuid.UUID, s Subject) (facts, error) {
	var f facts
	var err error
	if s.CustomerID != nil {
		if f.paid, err = q.CustomerHasPaid(ctx, db.CustomerHasPaidParams{OrganizationID: organizationID, CustomerID: s.CustomerID}); err != nil {
			return f, err
		}
	}
	if s.Instance == nil {
		return f, nil
	}
	instanceID := s.Instance.ID
	if f.holdsAddon, err = q.InstanceHoldsAnyAddon(ctx, db.InstanceHoldsAnyAddonParams{
		InstanceID: instanceID, AddonIds: nonNil(c.Row.ApplicableAddonIds),
	}); err != nil {
		return f, err
	}
	sub, err := q.GetRedeemSubscription(ctx, db.GetRedeemSubscriptionParams{OrganizationID: organizationID, InstanceID: &instanceID})
	switch {
	case err == nil:
		f.sub = &sub
	case !errors.Is(err, pgx.ErrNoRows):
		return f, err
	}
	if f.boostable, err = q.InstanceHasBoostable(ctx, db.InstanceHasBoostableParams{
		InstanceID: instanceID, EntitlementIds: nonNil(c.Entitlements),
	}); err != nil {
		return f, err
	}
	f.redeemed, err = q.InstanceRedeemed(ctx, db.InstanceRedeemedParams{InstanceID: instanceID, VoucherID: c.Row.ID})
	return f, err
}

// Check runs the checks of §11.4 that need the subject, in order: the
// customer, the licence, the add-ons, the redemption rules, the currency, a
// boost's targets, and a previous redemption.
func (c Candidate) Check(ctx context.Context, q *db.Queries, organizationID uuid.UUID, s Subject) (*Refusal, error) {
	f, err := c.gather(ctx, q, organizationID, s)
	if err != nil {
		return nil, err
	}
	return c.decide(s, f), nil
}

// Instance runs the checks of the redeeming instance.
func (c Candidate) Instance(ctx context.Context, q *db.Queries, organizationID uuid.UUID, instance db.GetInstanceForRedeemRow) (*Refusal, error) {
	return c.Check(ctx, q, organizationID, Subject{CustomerID: &instance.CustomerID, Instance: &instance, Plan: nil})
}

func (c Candidate) decide(s Subject, f facts) *Refusal {
	row := c.Row
	notEligible := func(rule string) *Refusal { return &Refusal{Reason: ReasonNotEligible, Rule: rule} }
	if row.RestrictedCustomerID != nil && s.CustomerID != nil && *row.RestrictedCustomerID != *s.CustomerID {
		return notEligible(RuleRestrictedCustomer)
	}
	var licenseID *uuid.UUID
	switch {
	case s.Plan != nil:
		licenseID = &s.Plan.LicenseID
	case s.Instance != nil:
		licenseID = &s.Instance.LicenseID
	}
	if len(row.ApplicableLicenseIds) > 0 && licenseID != nil && !slices.Contains(row.ApplicableLicenseIds, *licenseID) {
		return notEligible(RuleLicense)
	}
	if len(row.ApplicableAddonIds) > 0 && s.Instance != nil && !f.holdsAddon {
		return notEligible(RuleAddon)
	}

	// The subscription the period, amount and currency checks read: the one
	// the plan would start, else the instance's live one.
	type subscription struct{ period, currency, baseCurrency, baseAmount string }
	var sub *subscription
	switch {
	case s.Plan != nil:
		sub = &subscription{period: s.Plan.BillingPeriod, currency: s.Plan.Currency, baseCurrency: s.Plan.Currency, baseAmount: s.Plan.UnitAmountDecimal}
	case f.sub != nil:
		sub = &subscription{period: string(f.sub.BillingPeriod), currency: f.sub.Currency, baseCurrency: f.sub.BaseCurrency, baseAmount: f.sub.BaseAmount}
	}
	subjectKnown := s.Plan != nil || s.Instance != nil

	var rules RedemptionRules
	_ = json.Unmarshal(row.RedemptionRules, &rules)
	if rules.FirstTimeOnly && s.CustomerID != nil && f.paid {
		return notEligible(RuleFirstTimeOnly)
	}
	if rules.AnnualOnly && subjectKnown && (sub == nil || sub.period != string(db.BillingPeriodANNUAL)) {
		return notEligible(RuleAnnualOnly)
	}
	if m := rules.MinimumSubscriptionAmount; m != nil && subjectKnown {
		floor, _ := decimal.NewFromString(m.UnitAmountDecimal)
		if sub == nil || sub.baseCurrency != m.Currency {
			return notEligible(RuleMinimumAmount)
		}
		if amount, _ := decimal.NewFromString(sub.baseAmount); amount.LessThan(floor) {
			return notEligible(RuleMinimumAmount)
		}
	}
	if sub != nil && row.PriceDiscountType != nil && *row.PriceDiscountType == db.PriceDiscountTypeFIXEDAMOUNT && row.Currency != sub.currency {
		return &Refusal{Reason: ReasonCurrencyMismatch, Rule: ""}
	}
	if row.VoucherType == db.VoucherTypeENTITLEMENTBOOST && s.Instance != nil && !f.boostable {
		return notEligible(RuleNothingToBoost)
	}
	if s.Instance != nil && f.redeemed {
		return &Refusal{Reason: ReasonAlreadyRedeemed, Rule: ""}
	}
	return nil
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
