package createentitlement

import (
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

type Command struct {
	Name                    string                    `json:"name"`
	Description             *string                   `json:"description"`
	Type                    schema.Type               `json:"type"`
	AggregationMethod       *schema.AggregationMethod `json:"aggregationMethod,omitempty"`
	Slug                    *string                   `json:"slug,omitempty"`
	GroupSlugs              []string                  `json:"groupSlugs,omitempty"`
	Icon                    *string                   `json:"icon,omitempty"`
	UnitSingular            *string                   `json:"unitSingular,omitempty"`
	UnitPlural              *string                   `json:"unitPlural,omitempty"`
	SaleUnitSingular        *string                   `json:"saleUnitSingular,omitempty"`
	SaleUnitPlural          *string                   `json:"saleUnitPlural,omitempty"`
	SaleUnitFactor          *float64                  `json:"saleUnitFactor,omitempty"`
	UserFacing              *bool                     `json:"userFacing,omitempty"`
	DisplayOrder            *int32                    `json:"displayOrder,omitempty"`
	WarningThresholdPercent *int32                    `json:"warningThresholdPercent,omitempty"`
	ResetPeriod             *period.ResetPeriod       `json:"resetPeriod,omitempty"`
	ResetAnchor             *period.ResetAnchor       `json:"resetAnchor,omitempty"`
}
