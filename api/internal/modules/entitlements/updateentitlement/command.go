package updateentitlement

import (
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

// Command represents the request body for updating an entitlement
type Command struct {
	// Name of the entitlement
	Name string `json:"name" example:"Premium Plan"`
	// Description of the entitlement
	Description *string `json:"description" example:"Premium subscription with all features"`
	// Immutable: included only to reject modification attempts.
	Type *schema.Type `json:"type,omitempty" example:"subscription"`
	// Immutable: included only to reject modification attempts.
	AggregationMethod *schema.AggregationMethod `json:"aggregationMethod,omitempty" example:"sum"`
	GroupSlugs        []string                  `json:"groupSlugs,omitempty"`
	// Icon token (provider:name). Overwrites the stored value; null clears it.
	Icon *string `json:"icon,omitempty" example:"lucide:rocket"`
	// Unit fields overwrite the stored values; absent/null clears them.
	UnitSingular     *string  `json:"unitSingular,omitempty" example:"seat"`
	UnitPlural       *string  `json:"unitPlural,omitempty" example:"seats"`
	SaleUnitSingular *string  `json:"saleUnitSingular,omitempty" example:"pack"`
	SaleUnitPlural   *string  `json:"saleUnitPlural,omitempty" example:"packs"`
	SaleUnitFactor   *float64 `json:"saleUnitFactor,omitempty" example:"3"`
	// Overwrites the stored value; absent/null means not user facing.
	UserFacing *bool `json:"userFacing,omitempty" example:"true"`
	// Overwrites the stored value; absent/null resets it to 0.
	DisplayOrder *int32 `json:"displayOrder,omitempty" example:"10"`
	// Overwrites the stored value; absent/null resets it to 0 (disabled).
	WarningThresholdPercent *int32 `json:"warningThresholdPercent,omitempty" example:"80"`
	// One-way door: once configured (non-null on the stored entitlement), this
	// must be echoed back unchanged -- omitting it or sending a different value
	// is rejected as an attempted removal/change, not treated as a PUT reset to
	// null. Before configured, sending a non-null value here enables periodic
	// reset for the first and only time.
	ResetPeriod *period.ResetPeriod `json:"resetPeriod,omitempty" example:"MONTH"`
	// One-way door, same rule as ResetPeriod. Defaults to CALENDAR when
	// ResetPeriod is being enabled for the first time and this is omitted.
	ResetAnchor *period.ResetAnchor `json:"resetAnchor,omitempty" example:"CALENDAR"`
}
