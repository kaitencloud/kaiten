// Package dbmap translates the entitlements module's sqlc row types into its
// schema DTOs.
//
// It exists so the translation has a home that is allowed to know both, and
// schema does not. A wire type that imports infrastructure/db inverts the
// dependency the schema package is for: the DTO is what the contract promises
// and the row is what storage happens to hold today, so a schema package that
// names a generated type makes every regeneration a potential contract change.
// The mapping still has to name both -- that is what mapping is -- so it lives
// here, under infrastructure/, where naming a row type is the point rather than
// a leak.
//
// Direction: dbmap imports db and schema; neither imports dbmap. Repositories
// are the callers, which is where a row already exists.
package dbmap

import (
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	instancesschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
)

// ToEntitlement converts an entitlement row into the DTO the API returns.
//
// This is the whole of it. The schema package exported three names for this one
// function -- MapToSchema, MapRowToSchema and MapGetEntitlementsRowToSchema --
// each a bare call to the same unexported body, and each taking the same
// *db.Entitlement. The three names read as though the queries behind them
// returned different row types, which is the one thing they never did: sqlc
// compiles GetEntitlement and GetEntitlements to *db.Entitlement, so the
// distinction was already gone by the time any of them was called. Collapsing
// them is not a simplification of the mapping, it is the removal of a
// distinction that did not exist.
func ToEntitlement(entitlement *db.Entitlement) *schema.Entitlement {
	var aggregationMethod *schema.AggregationMethod
	if entitlement.AggregationMethod != nil {
		am := schema.AggregationMethod(*entitlement.AggregationMethod)
		aggregationMethod = &am
	}

	userFacing := entitlement.UserFacing
	displayOrder := entitlement.DisplayOrder
	warningThresholdPercent := int32(entitlement.WarningThresholdPercent)

	var resetPeriod *period.ResetPeriod
	if entitlement.ResetPeriod != nil {
		rp := period.ResetPeriod(*entitlement.ResetPeriod)
		resetPeriod = &rp
	}
	var resetAnchor *period.ResetAnchor
	if entitlement.ResetAnchor != nil {
		ra := period.ResetAnchor(*entitlement.ResetAnchor)
		resetAnchor = &ra
	}

	t := schema.Type(entitlement.Type)
	return &schema.Entitlement{
		ID:                      entitlement.ID,
		Name:                    entitlement.Name,
		Slug:                    entitlement.Slug,
		Description:             entitlement.Description,
		Type:                    &t,
		AggregationMethod:       aggregationMethod,
		Icon:                    entitlement.Icon,
		UnitSingular:            entitlement.UnitSingular,
		UnitPlural:              entitlement.UnitPlural,
		SaleUnitSingular:        entitlement.SaleUnitSingular,
		SaleUnitPlural:          entitlement.SaleUnitPlural,
		SaleUnitFactor:          entitlement.SaleUnitFactor,
		UserFacing:              &userFacing,
		DisplayOrder:            &displayOrder,
		WarningThresholdPercent: &warningThresholdPercent,
		ResetPeriod:             resetPeriod,
		ResetAnchor:             resetAnchor,
		CreatedAt:               entitlement.CreatedAt.Time,
		UpdatedAt:               entitlement.UpdatedAt.Time,
	}
}

// ToEntitlementType converts a stored entitlement_type into its schema
// counterpart. An unknown member is an error rather than a default: the value
// decides which validation NormalizeLicenseValue applies, so silently
// answering Config for a type this build does not know about would let an
// unvalidated value through. Every member of the PG enum must be listed here.
func ToEntitlementType(t db.EntitlementType) (schema.Type, error) {
	switch t {
	case db.EntitlementTypeNUMBER:
		return schema.Number, nil
	case db.EntitlementTypeNUMBERAICREDIT:
		return schema.NumberAICredit, nil
	case db.EntitlementTypeBOOLEAN:
		return schema.Boolean, nil
	case db.EntitlementTypeCONFIG:
		return schema.Config, nil
	default:
		return "", fmt.Errorf("unknown entitlement type %q", string(t))
	}
}

// ToEntitlementGroup converts an entitlement_group row into the API schema.
func ToEntitlementGroup(eg *db.EntitlementGroup) *schema.EntitlementGroup {
	return &schema.EntitlementGroup{
		ID:          eg.ID,
		Name:        eg.Name,
		Slug:        eg.Slug,
		Description: eg.Description,
	}
}

// toEntitlementGroupRef is the summary shape embedded in an entitlement
// payload. Unexported: every caller wants a whole slice of them, and one alone
// has never been asked for.
func toEntitlementGroupRef(eg *db.EntitlementGroup) *schema.EntitlementGroupSummary {
	return &schema.EntitlementGroupSummary{
		ID:   eg.ID,
		Name: eg.Name,
		Slug: eg.Slug,
	}
}

// ToEntitlementGroupRefs converts group rows into the summaries embedded in an
// entitlement payload.
func ToEntitlementGroupRefs(groups []db.EntitlementGroup) []*schema.EntitlementGroupSummary {
	refs := make([]*schema.EntitlementGroupSummary, 0, len(groups))

	for _, group := range groups {
		refs = append(refs, toEntitlementGroupRef(&group))
	}

	return refs
}

// ToEntitlementGroupUsage converts a group-usage row into the API schema.
func ToEntitlementGroupUsage(row *db.GetEntitlementGroupUsageRow) (*schema.EntitlementGroupUsage, error) {
	usageValue, err := instancesschema.ParseEntitlementValue(row.UsageValue)
	if err != nil {
		return nil, err
	}

	// The instance's effective entitlement: what its licence grants, plus any
	// later layer the view adds. Nil for a member the instance is not granted.
	licenseValue, err := instancesschema.ParseEntitlementValue(row.EffectiveValue)
	if err != nil {
		return nil, err
	}

	return &schema.EntitlementGroupUsage{
		EntitlementID:   row.EntitlementID,
		EntitlementSlug: row.EntitlementSlug,
		EntitlementName: row.EntitlementName,
		EntitlementType: string(row.EntitlementType),
		UsageValue:      usageValue,
		LicenseValue:    licenseValue,
	}, nil
}
