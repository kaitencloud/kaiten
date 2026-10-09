// Package getpubliccatalog is the public catalogue: what a vendor's pricing
// page renders, read with a publishable key (§14.4).
//
// It lists, for every licence family the organization made public, the
// family's default version -- always PUBLISHED -- with its ACTIVE prices and
// its user-facing entitlements, and the same for public add-on families. Every
// shape here is a projection built for this route: no author, no timestamp of
// internal interest, no instance, no customer, and no private family's slug.
package getpubliccatalog

import (
	"encoding/json"
)

// Catalog is GET /public/catalog.
type PublicCatalog struct {
	Plans        []PublicPlan              `json:"plans" nullable:"false" doc:"The default version of each public licence family, by family slug"`
	AddOns       []PublicAddOn             `json:"addOns" nullable:"false" doc:"The default version of each public add-on family; empty when include omits addons"`
	Capabilities PublicCatalogCapabilities `json:"capabilities"`
}

// Plan is one public licence family's default version.
type PublicPlan struct {
	FamilySlug              string                  `json:"familySlug" example:"pro"`
	LicenseSlug             string                  `json:"licenseSlug" doc:"The version's own slug" example:"pro-v3"`
	LicenseID               string                  `json:"licenseId" format:"uuid"`
	Name                    string                  `json:"name" example:"Pro"`
	Description             string                  `json:"description"`
	LifecycleState          string                  `json:"lifecycleState" enum:"PUBLISHED" doc:"Always PUBLISHED: only the default version is listed, and a default version is published"`
	PricingType             string                  `json:"pricingType" enum:"FREE,PAID,CUSTOM" doc:"CUSTOM: priced on request; render selfServeCtaUrl"`
	TrialPeriodDays         *int32                  `json:"trialPeriodDays" doc:"Length of the free trial; null when the plan has none"`
	RequiresPaymentMethod   bool                    `json:"requiresPaymentMethod" doc:"A card is captured before subscribing, even when nothing is due"`
	SelfServe               bool                    `json:"selfServe" doc:"Whether a customer can subscribe to this plan alone: not CUSTOM, with a default ACTIVE flat-fee price, and either FREE or sold through a provider that captures payment methods. Otherwise render selfServeCtaUrl."`
	SelfServeCtaURL         *string                 `json:"selfServeCtaUrl" doc:"Where to send a customer who cannot subscribe alone (\"Contact us\")"`
	Currency                *string                 `json:"currency" doc:"ISO 4217 code of the plan's prices; null when it has none" example:"EUR"`
	Prices                  []PublicPrice           `json:"prices" nullable:"false" doc:"ACTIVE prices, in display order"`
	CompatibleAddonFamilies []string                `json:"compatibleAddonFamilies" nullable:"false" doc:"Public add-on families whose listed version fits this plan"`
	Entitlements            []PublicPlanEntitlement `json:"entitlements" nullable:"false" doc:"User-facing entitlements the plan grants, in display order"`
}

// Price is a price as the public surface shows it: what it costs and how it is
// billed, without its history.
type PublicPrice struct {
	ID                string       `json:"id" format:"uuid"`
	BillingModel      string       `json:"billingModel" enum:"FLAT_FEE,USAGE_BASED,OVERAGE" doc:"FLAT_FEE: per billing period. USAGE_BASED: per sale unit of usage. OVERAGE: per sale unit of usage above the limit. Never sum metered prices into a headline."`
	BillingTiming     string       `json:"billingTiming" enum:"ADVANCE,ARREARS"`
	BillingPeriod     *string      `json:"billingPeriod,omitempty" enum:"MONTHLY,QUARTERLY,SEMI_ANNUAL,ANNUAL" doc:"The period a FLAT_FEE price is charged for; absent on metered prices"`
	Currency          string       `json:"currency" example:"EUR"`
	UnitAmount        *int64       `json:"unitAmount,omitempty" doc:"The amount in minor units, when it is a whole number of them; absent otherwise (render unitAmountDecimal)" example:"2900"`
	UnitAmountDecimal string       `json:"unitAmountDecimal" doc:"The amount in minor units, up to 12 decimal places" example:"2900"`
	Metered           *PublicMeter `json:"metered,omitempty" doc:"What a metered price measures; absent on FLAT_FEE prices"`
	DisplayLabel      *string      `json:"displayLabel,omitempty" example:"Pro plan"`
	DisplayOrder      int32        `json:"displayOrder"`
	IsDefault         bool         `json:"isDefault" doc:"The FLAT_FEE price shown for its billing period"`
}

// Meter is what a metered price measures.
type PublicMeter struct {
	EntitlementSlug  string  `json:"entitlementSlug" example:"tokens"`
	SaleUnitFactor   string  `json:"saleUnitFactor" doc:"Measured units in one sale unit" example:"10000"`
	SaleUnitSingular *string `json:"saleUnitSingular,omitempty" example:"10k tokens"`
	SaleUnitPlural   *string `json:"saleUnitPlural,omitempty" example:"10k tokens"`
}

// PlanEntitlement is one user-facing grant of a plan.
type PublicPlanEntitlement struct {
	Slug                           string          `json:"slug" example:"seats"`
	Name                           string          `json:"name" example:"Seats"`
	Description                    *string         `json:"description,omitempty"`
	Type                           string          `json:"type" enum:"BOOLEAN,NUMBER,CONFIG"`
	Value                          json.RawMessage `json:"value" doc:"The granted value: a boolean, a number, or a configuration object"`
	Unlimited                      bool            `json:"unlimited" doc:"A NUMBER grant with no limit"`
	LimitCapExceededOveragePercent *int32          `json:"limitCapExceededOveragePercent,omitempty" doc:"How far usage may exceed a NUMBER grant before it is refused: 0 is a hard limit, -1 is unlimited; absent for other types"`
	Icon                           *string         `json:"icon,omitempty"`
	UnitSingular                   *string         `json:"unitSingular,omitempty" example:"seat"`
	UnitPlural                     *string         `json:"unitPlural,omitempty" example:"seats"`
	SaleUnitSingular               *string         `json:"saleUnitSingular,omitempty"`
	SaleUnitPlural                 *string         `json:"saleUnitPlural,omitempty"`
	SaleUnitFactor                 *string         `json:"saleUnitFactor,omitempty"`
	DisplayOrder                   int32           `json:"displayOrder"`
}

// AddOn is one public add-on family's default version.
type PublicAddOn struct {
	FamilySlug                string                   `json:"familySlug" example:"extra-seats"`
	AddonSlug                 string                   `json:"addonSlug" example:"extra-seats-v1"`
	AddonID                   string                   `json:"addonId" format:"uuid"`
	Name                      string                   `json:"name"`
	Description               string                   `json:"description"`
	PricingType               string                   `json:"pricingType" enum:"FREE,PAID,CUSTOM"`
	MaxQuantity               *int32                   `json:"maxQuantity" doc:"Most units one instance may attach; null when unbounded"`
	Prices                    []PublicPrice            `json:"prices" nullable:"false"`
	Entitlements              []PublicAddOnEntitlement `json:"entitlements" nullable:"false" doc:"User-facing entitlements one unit grants"`
	CompatibleLicenseFamilies []string                 `json:"compatibleLicenseFamilies" nullable:"false" doc:"Public licence families this add-on fits"`
}

// AddOnEntitlement is one user-facing grant of an add-on.
type PublicAddOnEntitlement struct {
	Slug                           string          `json:"slug"`
	Name                           string          `json:"name"`
	Type                           string          `json:"type" enum:"BOOLEAN,NUMBER,CONFIG"`
	Value                          json.RawMessage `json:"value"`
	OverrideBehavior               string          `json:"overrideBehavior" enum:"ADD,OVERRIDE,MAX" doc:"How the grant combines with the plan's: added to it, replacing it, or the larger of the two"`
	LimitCapExceededOveragePercent *int32          `json:"limitCapExceededOveragePercent,omitempty"`
}

// Capabilities is what the vendor's storefront can offer beyond showing prices.
type PublicCatalogCapabilities struct {
	Checkout       bool `json:"checkout" doc:"Whether a plan of the catalogue can be bought alone, through a customer session's checkout (POST /public/session/checkout)"`
	PaymentMethods bool `json:"paymentMethods" doc:"Whether the organization's billing provider captures payment methods"`
}
