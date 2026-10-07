// Package prices is what the licence price use cases share: the resource
// shape, the rules a price must satisfy, and reading and writing it.
//
// A price hangs on a licence version and is one billable concern -- one line
// of an invoice. A FLAT_FEE price is an amount per billing period; a
// USAGE_BASED or OVERAGE price is an amount per sale unit of one metered
// entitlement, billed in arrears. Amounts are in the currency's minor units, as
// decimal strings (see internal/infrastructure/billing/money).
package prices

import (
	"time"

	"github.com/google/uuid"
)

// Billing models, timings, periods and statuses, as the API spells them.
const (
	ModelFlatFee    = "FLAT_FEE"
	ModelUsageBased = "USAGE_BASED"
	ModelOverage    = "OVERAGE"

	TimingAdvance = "ADVANCE"
	TimingArrears = "ARREARS"

	StatusActive     = "ACTIVE"
	StatusDeprecated = "DEPRECATED"
)

// Price is a licence price as the API returns it.
type Price struct {
	ID                uuid.UUID   `json:"id" readOnly:"true" doc:"Unique identifier of the price"`
	BillingModel      string      `json:"billingModel" enum:"FLAT_FEE,USAGE_BASED,OVERAGE" doc:"FLAT_FEE: an amount per billing period. USAGE_BASED: an amount per sale unit of the metered entitlement's usage. OVERAGE: an amount per sale unit of the usage above the licence's limit."`
	BillingTiming     string      `json:"billingTiming" enum:"ADVANCE,ARREARS" doc:"ADVANCE bills the period that starts; ARREARS the period that ended. Metered prices are always ARREARS."`
	BillingPeriod     *string     `json:"billingPeriod,omitempty" enum:"MONTHLY,QUARTERLY,SEMI_ANNUAL,ANNUAL" doc:"The period a FLAT_FEE price is charged for. Absent on metered prices, which bill on the subscription's period."`
	Currency          string      `json:"currency" doc:"ISO 4217 code, upper case. One currency per licence version." example:"EUR"`
	UnitAmount        *int64      `json:"unitAmount,omitempty" doc:"unitAmountDecimal as an integer number of minor units, when it is one; absent otherwise." example:"2900"`
	UnitAmountDecimal string      `json:"unitAmountDecimal" doc:"Amount in the currency's minor units (cents for EUR): per period for FLAT_FEE, per sale unit for metered prices. Up to 12 decimal places." example:"2900"`
	Metered           *PriceMeter `json:"metered,omitempty" doc:"What a metered price measures. Absent on FLAT_FEE prices."`
	DisplayLabel      *string     `json:"displayLabel,omitempty" doc:"The invoice line's label; a default is derived when absent." example:"Pro plan"`
	DisplayOrder      int32       `json:"displayOrder" doc:"Order among the version's prices" example:"0"`
	IsDefault         bool        `json:"isDefault" doc:"The FLAT_FEE price picked for its billing period when none is named. At most one per period; only an ACTIVE FLAT_FEE price."`
	Status            string      `json:"status" enum:"ACTIVE,DEPRECATED" doc:"A DEPRECATED price keeps billing what is already pinned to it but is no longer offered."`
	DeprecatedAt      *time.Time  `json:"deprecatedAt,omitempty" doc:"When the price was deprecated"`
	CreatedAt         time.Time   `json:"createdAt" readOnly:"true"`
	UpdatedAt         time.Time   `json:"updatedAt" readOnly:"true"`
}

// PriceMeter is what a metered price measures.
type PriceMeter struct {
	EntitlementSlug  string  `json:"entitlementSlug" doc:"The metered entitlement" example:"tokens"`
	SaleUnitFactor   string  `json:"saleUnitFactor" doc:"Measured units in one sale unit, captured when the price was created (1 when the entitlement has no sale unit): 10000 bills per 10,000 tokens." example:"10000"`
	SaleUnitSingular *string `json:"saleUnitSingular,omitempty" example:"10k tokens"`
	SaleUnitPlural   *string `json:"saleUnitPlural,omitempty" example:"10k tokens"`
}

// LicensePriceEvent is the payload of LICENSE_PRICE_CREATED and LICENSE_PRICE_DEPRECATED:
// the price and the version it belongs to.
type LicensePriceEvent struct {
	Price
	LicenseSlug string `json:"licenseSlug" doc:"The licence version the price belongs to"`
	FamilySlug  string `json:"familySlug" doc:"The family of that version"`
}

// LicensePriceUpdatedEvent is the payload of LICENSE_PRICE_UPDATED.
type LicensePriceUpdatedEvent struct {
	LicensePriceEvent
	ChangedFields []string `json:"changedFields" doc:"The members the update changed, as the API names them"`
}
