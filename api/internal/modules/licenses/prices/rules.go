package prices

import (
	"encoding/json"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Draft is a price as it would be written: a create request, or an update
// merged over the stored price. Validate checks it whole, so a create and an
// update refuse the same things with the same reasons.
type Draft struct {
	BillingModel           string
	BillingTiming          string
	BillingPeriod          *string
	Currency               string
	UnitAmountDecimal      string
	MeteredEntitlementSlug string
	DisplayLabel           *string
	DisplayOrder           int32
	IsDefault              bool
}

// Metered reports whether the draft meters an entitlement.
func (d Draft) Metered() bool {
	return d.BillingModel == ModelUsageBased || d.BillingModel == ModelOverage
}

// Shape checks what the draft says about itself, before anything is read:
// currency, amount, timing, period and default. Reasons are prefixed by
// operation ("CreateLicensePrice").
func (d Draft) Shape(operation string) (money.Currency, decimal.Decimal, error) {
	currency, err := money.ParseCurrency(d.Currency)
	if err != nil {
		return "", decimal.Decimal{}, kaitenerrors.UnprocessableEntity(operation+".InvalidCurrency",
			"currency must be an upper-case ISO 4217 code")
	}
	amount, err := money.ParseUnitAmount(d.UnitAmountDecimal)
	if err != nil {
		return "", decimal.Decimal{}, kaitenerrors.UnprocessableEntity(operation+".InvalidAmount",
			"unitAmountDecimal must be a non-negative decimal of at most 12 integer digits and 12 decimal places, in minor units")
	}
	if d.Metered() && d.BillingTiming != TimingArrears {
		return "", decimal.Decimal{}, kaitenerrors.UnprocessableEntity(operation+".InvalidTiming",
			"a metered price bills in ARREARS: usage cannot be billed before it happens")
	}
	if d.Metered() != (d.BillingPeriod == nil) {
		return "", decimal.Decimal{}, kaitenerrors.UnprocessableEntity(operation+".InvalidPeriod",
			"billingPeriod is required on a FLAT_FEE price and refused on a metered one")
	}
	if d.Metered() && d.MeteredEntitlementSlug == "" {
		return "", decimal.Decimal{}, kaitenerrors.UnprocessableEntity(operation+".EntitlementNotGranted",
			"a metered price needs meteredEntitlementSlug")
	}
	if !d.Metered() && d.MeteredEntitlementSlug != "" {
		return "", decimal.Decimal{}, kaitenerrors.UnprocessableEntity(operation+".InvalidPeriod",
			"a FLAT_FEE price meters nothing: omit meteredEntitlementSlug")
	}
	if d.IsDefault && d.Metered() {
		return "", decimal.Decimal{}, kaitenerrors.UnprocessableEntity(operation+".InvalidDefault",
			"only a FLAT_FEE price can be a default")
	}
	return currency, amount, nil
}

// Meters checks the entitlement a metered draft would meter, read with the
// version's grant of it, and returns the sale-unit factor to snapshot:
//   - only a flow is metered: a reset period, SUM or COUNT, a NUMBER type;
//   - the version must grant it;
//   - an OVERAGE price needs a grant whose overage can be reached;
//   - no other ACTIVE price of the version may meter it (otherMeters).
func Meters(operation string, d Draft, entitlement db.GetPricingEntitlementRow, otherMeters int32) (string, error) {
	if entitlement.ResetPeriod == nil {
		return "", kaitenerrors.UnprocessableEntity(operation+".EntitlementIsStock",
			"only an entitlement with a reset period can be metered: a lifetime counter is a stock, sold as an add-on")
	}
	if entitlement.AggregationMethod == nil ||
		(*entitlement.AggregationMethod != db.AggregationMethodSUM && *entitlement.AggregationMethod != db.AggregationMethodCOUNT) {
		return "", kaitenerrors.UnprocessableEntity(operation+".UnsupportedAggregation",
			"only a SUM or COUNT entitlement can be metered")
	}
	if entitlement.Type != db.EntitlementTypeNUMBER && entitlement.Type != db.EntitlementTypeNUMBERAICREDIT {
		return "", kaitenerrors.UnprocessableEntity(operation+".UnsupportedEntitlementType",
			"only a NUMBER or NUMBER_AI_CREDIT entitlement can be metered")
	}
	if entitlement.GrantValue == nil {
		return "", kaitenerrors.UnprocessableEntity(operation+".EntitlementNotGranted",
			"the licence version does not grant this entitlement")
	}
	if d.BillingModel == ModelOverage && !overageReachable(entitlement) {
		return "", kaitenerrors.UnprocessableEntity(operation+".OverageUnreachable",
			"the version grants this entitlement without overage (a hard or unlimited limit): an OVERAGE price could never bill")
	}
	if otherMeters > 0 {
		return "", kaitenerrors.UnprocessableEntity(operation+".EntitlementAlreadyMetered",
			"another active price of this version already meters this entitlement")
	}
	factor := entitlement.SaleUnitFactor
	if factor == "" {
		factor = "1"
	}
	return factor, nil
}

// overageReachable reports whether a grant allows usage above its limit: a
// finite limit with a positive overage percent.
func overageReachable(entitlement db.GetPricingEntitlementRow) bool {
	if entitlement.GrantOveragePercent == nil || *entitlement.GrantOveragePercent <= 0 {
		return false
	}
	var value struct {
		Value float64 `json:"value"`
	}
	if json.Unmarshal(entitlement.GrantValue, &value) != nil {
		return false
	}
	return value.Value >= 0
}

// NoPrice is the price id CountOtherActiveMeteredPrices excludes when a new
// price is being created.
var NoPrice = uuid.Nil
