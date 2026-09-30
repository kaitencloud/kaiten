package graphql

import (
	"errors"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
)

// ErrMissingIdentity is returned when identity is not in context.
var ErrMissingIdentity = errors.New("missing identity in context")

// toEntitlementSchema converts a sqlc entitlement row (plus its resolved group
// refs) to the wire schema. Pointer fields mirror the REST wire type so the
// GraphQL binding reuses the exact same struct.
func toEntitlementSchema(e db.Entitlement, groups []*schema.EntitlementGroupSummary) schema.Entitlement {
	entitlementType := schema.Type(e.Type)
	userFacing := e.UserFacing
	displayOrder := e.DisplayOrder
	warningThresholdPercent := int32(e.WarningThresholdPercent)

	var resetPeriod *period.ResetPeriod
	if e.ResetPeriod != nil {
		rp := period.ResetPeriod(*e.ResetPeriod)
		resetPeriod = &rp
	}
	var resetAnchor *period.ResetAnchor
	if e.ResetAnchor != nil {
		ra := period.ResetAnchor(*e.ResetAnchor)
		resetAnchor = &ra
	}

	return schema.Entitlement{
		ID:                      e.ID,
		Name:                    e.Name,
		Slug:                    e.Slug,
		Description:             e.Description,
		Type:                    &entitlementType,
		AggregationMethod:       (*schema.AggregationMethod)(e.AggregationMethod),
		Icon:                    e.Icon,
		UnitSingular:            e.UnitSingular,
		UnitPlural:              e.UnitPlural,
		SaleUnitSingular:        e.SaleUnitSingular,
		SaleUnitPlural:          e.SaleUnitPlural,
		SaleUnitFactor:          e.SaleUnitFactor,
		UserFacing:              &userFacing,
		DisplayOrder:            &displayOrder,
		WarningThresholdPercent: &warningThresholdPercent,
		ResetPeriod:             resetPeriod,
		ResetAnchor:             resetAnchor,
		EntitlementGroups:       groups,
		CreatedAt:               e.CreatedAt.Time,
		UpdatedAt:               e.UpdatedAt.Time,
	}
}

// groupsBySlug indexes org-wide entitlement-group rows by entitlement slug.
func groupsBySlug(rows []db.GetEntitlementGroupsForOrganizationEntitlementsRow) map[string][]*schema.EntitlementGroupSummary {
	index := make(map[string][]*schema.EntitlementGroupSummary, len(rows))
	for i := range rows {
		g := &rows[i]
		index[g.EntitlementSlug] = append(index[g.EntitlementSlug], &schema.EntitlementGroupSummary{
			ID:   g.ID,
			Name: g.Name,
			Slug: g.Slug,
		})
	}
	return index
}
