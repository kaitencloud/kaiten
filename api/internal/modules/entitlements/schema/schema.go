package schema

import (
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
)

type Type string

const (
	Boolean Type = "BOOLEAN"
	Number  Type = "NUMBER"
	Config  Type = "CONFIG"
	// NumberAICredit is a NUMBER-family entitlement type dedicated to metering AI
	// credit usage. It follows the same meter/aggregation/unit rules as Number,
	// including its overage policy: see license_entitlement's
	// limit_cap_exceeded_overage_percent for how a grant's enforcement is set.
	NumberAICredit Type = "NUMBER_AI_CREDIT"
)

// IsNumberFamily reports whether entitlements of this type carry a numeric
// usage cap and report usage metrics (Number and NumberAICredit); Boolean and
// Config entitlements do not.
func IsNumberFamily(t Type) bool {
	return t == Number || t == NumberAICredit
}

type AggregationMethod string

const (
	Count   AggregationMethod = "COUNT"
	Sum     AggregationMethod = "SUM"
	Average AggregationMethod = "AVERAGE"
	Min     AggregationMethod = "MIN"
	Max     AggregationMethod = "MAX"
	Latest  AggregationMethod = "LATEST"
)

// UsageSource says where the usage of a NUMBER-family entitlement comes from.
// BOOLEAN and CONFIG entitlements have no usage and carry none.
type UsageSource string

const (
	// CalculatedUsage: the vendor's code reports the usage, and Kaiten folds
	// each report with the entitlement's aggregation method. Every entitlement
	// that existed before combined entitlements, and the default.
	CalculatedUsage UsageSource = "CALCULATED_USAGE"
	// CombinedUsage: the usage is the weighted sum of the usage of other
	// entitlements, its sources, computed when it is read. Nothing is stored for
	// it, and nothing is enforced on it.
	CombinedUsage UsageSource = "COMBINED_USAGE"
)

// EntitlementSource is one source of a combined entitlement: the entitlement
// whose usage it sums, and the rate one unit of that usage is worth.
type EntitlementSource struct {
	EntitlementSlug string `json:"entitlementSlug" doc:"Slug of the source entitlement" example:"firecrawl-credits" minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	Weight          string `json:"weight,omitempty" doc:"Conversion rate: one unit of the source is worth this many units of the combined entitlement. An exact decimal string, strictly positive, up to 8 integer digits and 10 decimals; 1 when omitted. Weights do not have to add up to 1." example:"0.4" pattern:"^[0-9]{1,8}(\\.[0-9]{1,10})?$"`
}

// Entitlement is reused unmodified as the request body for both
// create-entitlement and update-entitlement, as well as the response for
// both and get-entitlement. ID/CreatedAt/UpdatedAt are readOnly:"true"
// (server-assigned). GroupSlugs is writeOnly:"true": groups are named by
// slug on the way in but reported back as full references on the way out
// (EntitlementGroups, readOnly:"true") -- the server never populates
// GroupSlugs when building a response, so it stays correctly absent from
// JSON output regardless. Slug is accepted on create but not settable
// through update-entitlement -- its handler rejects it being present and
// different from the current slug with a 422.
type Entitlement struct {
	ID                uuid.UUID                  `json:"id" readOnly:"true" doc:"Unique identifier for the entitlement" example:"123e4567-e89b-12d3-a456-426614174000"`
	Name              string                     `json:"name" doc:"Name of the entitlement" example:"Basic Plan" minLength:"1"`
	Slug              string                     `json:"slug,omitempty" example:"basic-plan" doc:"Optional URL-friendly identifier, unique per organization. Auto-generated if not provided." minLength:"2" maxLength:"100" pattern:"^[a-z0-9][a-z0-9-]*[a-z0-9]$"`
	Description       *string                    `json:"description" doc:"Description of the entitlement" example:"Basic subscription plan with limited features"`
	Type              *Type                      `json:"type,omitempty" doc:"Type of the entitlement" enum:"BOOLEAN,NUMBER,CONFIG,NUMBER_AI_CREDIT" example:"NUMBER"`
	AggregationMethod *AggregationMethod         `json:"aggregationMethod,omitempty" doc:"Method used to fold each reported usage value into the stored total (NUMBER only). Defaults to SUM; a COMBINED_USAGE entitlement is always SUM." enum:"COUNT,SUM,AVERAGE,MIN,MAX,LATEST" example:"SUM"`
	UsageSource       *UsageSource               `json:"usageSource,omitempty" doc:"Where the usage of a NUMBER or NUMBER_AI_CREDIT entitlement comes from; absent for BOOLEAN and CONFIG. CALCULATED_USAGE (the default): your code reports it, and Kaiten folds each report with aggregationMethod. COMBINED_USAGE (NUMBER only): the weighted sum of the usage of other entitlements, its sources, computed when it is read, for display only: a usage report on it is refused and nothing is enforced on the sum. Immutable once created." enum:"CALCULATED_USAGE,COMBINED_USAGE" example:"CALCULATED_USAGE"`
	Sources           []EntitlementSource        `json:"sources,omitempty" doc:"The entitlements a COMBINED_USAGE entitlement sums, each with its weight: at least two, each named once; refused on a CALCULATED_USAGE entitlement. A source is a NUMBER or NUMBER_AI_CREDIT entitlement of the organization that is not itself combined, aggregated by SUM or COUNT, on the same resetPeriod and resetAnchor as the other sources, lifetime included; the combined entitlement takes that window, so its own resetPeriod and resetAnchor are derived, and a value sent for them must match it. A PUT replaces the sources as a whole. Changing the sources or a weight re-values the present for every instance, the current window included."`
	GroupSlugs        []string                   `json:"groupSlugs,omitempty" writeOnly:"true" doc:"Groups associated with this entitlement, identified by slug"`
	EntitlementGroups []*EntitlementGroupSummary `json:"entitlementGroups,omitempty" readOnly:"true" doc:"Groups associated with this entitlement"`
	Icon              *string                    `json:"icon,omitempty" doc:"Optional icon, stored as a provider-namespaced token (provider:name). Decoupled from any specific icon library." example:"lucide:rocket" pattern:"^[a-z0-9]+:[a-z0-9]+(-[a-z0-9]+)*$" maxLength:"64"`
	UnitSingular      *string                    `json:"unitSingular,omitempty" doc:"Singular label of the base unit this entitlement is measured in (NUMBER type only). Must be provided together with unitPlural." example:"seat" minLength:"1" maxLength:"100"`
	UnitPlural        *string                    `json:"unitPlural,omitempty" doc:"Plural label of the base unit this entitlement is measured in (NUMBER type only). Must be provided together with unitSingular." example:"seats" minLength:"1" maxLength:"100"`
	SaleUnitSingular  *string                    `json:"saleUnitSingular,omitempty" doc:"Singular label of the unit this entitlement is sold in, when it differs from the base unit. Requires the base unit labels and the full sale unit trio (saleUnitSingular, saleUnitPlural, saleUnitFactor)." example:"pack" minLength:"1" maxLength:"100"`
	SaleUnitPlural    *string                    `json:"saleUnitPlural,omitempty" doc:"Plural label of the unit this entitlement is sold in, when it differs from the base unit." example:"packs" minLength:"1" maxLength:"100"`
	SaleUnitFactor    *float64                   `json:"saleUnitFactor,omitempty" doc:"Number of base units one sale unit represents (1 sale unit = N base units)." example:"3" exclusiveMinimum:"0"`
	UserFacing        *bool                      `json:"userFacing,omitempty" doc:"Whether this entitlement is displayed in customer-facing components: the public catalogue (plan and pricing pages) and the customer portal, which lists only the user-facing entitlements of an instance. Defaults to false." example:"true"`
	DisplayOrder      *int32                     `json:"displayOrder,omitempty" doc:"Sort order of this entitlement in customer-facing components (ascending). Defaults to 0." example:"10" minimum:"0"`
	// WarningThresholdPercent is the percentage of the cap at which an early-warning
	// crossing event is emitted (e.g. 80 means the warning fires at 80% of the cap).
	// 0 disables the warning. Only allowed for NUMBER/NUMBER_AI_CREDIT entitlements.
	WarningThresholdPercent *int32 `json:"warningThresholdPercent,omitempty" doc:"Percentage of the cap at which an early-warning event fires before the cap is reached. 0 disables the warning (default)." example:"80" minimum:"0" maximum:"100"`
	// ResetPeriod is a one-way door: once set on an entitlement it can never be
	// changed or removed (see updateentitlement's immutability check). NULL means
	// a lifetime counter, preserving pre-existing behavior.
	ResetPeriod *period.ResetPeriod `json:"resetPeriod,omitempty" doc:"Cadence at which usage automatically resets for this NUMBER entitlement. NULL means a lifetime counter (default). Immutable once set -- a full-replace PUT must echo back the stored value." enum:"HOUR,DAY,WEEK,MONTH,YEAR" example:"MONTH"`
	// ResetAnchor is required exactly when ResetPeriod is set, defaults to
	// CALENDAR when omitted while enabling a reset period, and is immutable
	// once set, for the same one-way-door reason as ResetPeriod.
	ResetAnchor *period.ResetAnchor `json:"resetAnchor,omitempty" doc:"Phase of the periodic usage window: CALENDAR (UTC calendar-aligned), LICENSE_START (phased off the instance's license start date) or BILLING_PERIOD (phased off the instance's live subscription's billing anchor, LICENSE_START without one; with resetPeriod MONTH or YEAR only). Required exactly when resetPeriod is set; defaults to CALENDAR when omitted. Immutable once set." enum:"CALENDAR,LICENSE_START,BILLING_PERIOD" example:"CALENDAR"`

	CreatedAt time.Time `json:"createdAt" readOnly:"true" example:"2023-10-01T12:00:00Z" doc:"Timestamp when this entitlement was created"`
	UpdatedAt time.Time `json:"updatedAt" readOnly:"true" example:"2023-10-02T12:00:00Z" doc:"Timestamp when this entitlement was last updated"`
}

// EntitlementPage is a cursor-paginated page of entitlements, returned by
// the GraphQL entitlements field on Query -- the GraphQL counterpart of the
// REST getentitlements endpoint's pagination.Page[*Entitlement] envelope.
// It is a plain (non-generic) struct, rather than pagination.Page itself,
// because gqlgen's model binding (see gqlgen.yml) needs a concrete Go type
// to bind the EntitlementPage GraphQL type to.
type EntitlementPage struct {
	Items      []Entitlement
	NextCursor *string
	HasMore    bool
}
