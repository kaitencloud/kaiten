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
	AggregationMethod *AggregationMethod         `json:"aggregationMethod,omitempty" doc:"Method used to fold each reported usage value into the stored total (NUMBER only). Defaults to SUM." enum:"COUNT,SUM,AVERAGE,MIN,MAX,LATEST" example:"SUM"`
	GroupSlugs        []string                   `json:"groupSlugs,omitempty" writeOnly:"true" doc:"Groups associated with this entitlement, identified by slug"`
	EntitlementGroups []*EntitlementGroupSummary `json:"entitlementGroups,omitempty" readOnly:"true" doc:"Groups associated with this entitlement"`
	Icon              *string                    `json:"icon,omitempty" doc:"Optional icon, stored as a provider-namespaced token (provider:name). Decoupled from any specific icon library." example:"lucide:rocket" pattern:"^[a-z0-9]+:[a-z0-9]+(-[a-z0-9]+)*$" maxLength:"64"`
	UnitSingular      *string                    `json:"unitSingular,omitempty" doc:"Singular label of the base unit this entitlement is measured in (NUMBER type only). Must be provided together with unitPlural." example:"seat" minLength:"1" maxLength:"100"`
	UnitPlural        *string                    `json:"unitPlural,omitempty" doc:"Plural label of the base unit this entitlement is measured in (NUMBER type only). Must be provided together with unitSingular." example:"seats" minLength:"1" maxLength:"100"`
	SaleUnitSingular  *string                    `json:"saleUnitSingular,omitempty" doc:"Singular label of the unit this entitlement is sold in, when it differs from the base unit. Requires the base unit labels and the full sale unit trio (saleUnitSingular, saleUnitPlural, saleUnitFactor)." example:"pack" minLength:"1" maxLength:"100"`
	SaleUnitPlural    *string                    `json:"saleUnitPlural,omitempty" doc:"Plural label of the unit this entitlement is sold in, when it differs from the base unit." example:"packs" minLength:"1" maxLength:"100"`
	SaleUnitFactor    *float64                   `json:"saleUnitFactor,omitempty" doc:"Number of base units one sale unit represents (1 sale unit = N base units)." example:"3" exclusiveMinimum:"0"`
	UserFacing        *bool                      `json:"userFacing,omitempty" doc:"Whether this entitlement is displayed in customer-facing components (e.g. plan and pricing pages). Defaults to false." example:"true"`
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
	ResetAnchor *period.ResetAnchor `json:"resetAnchor,omitempty" doc:"Phase of the periodic usage window: CALENDAR (UTC calendar-aligned) or LICENSE_START (phased off the instance's license start date). Required exactly when resetPeriod is set; defaults to CALENDAR when omitted. Immutable once set." enum:"CALENDAR,LICENSE_START" example:"CALENDAR"`

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
