package getpubliccatalog

import (
	"fmt"
	"slices"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
)

// withCombinedGrants adds to what each plan grants the user-facing combined
// entitlements it reads as: the weighted sum of the grants of the sources the
// version grants, the same sum the usage readers make of a limit, unlimited as
// soon as one of them is. A version that grants none of a combined entitlement's
// sources does not grant it. The plan's list stays in the order the catalogue
// shows it: display order, then slug.
//
// ponytail: the sources are the rows the query returns, so one the catalogue
// hides (an AI credit pool, while AI is off) counts as not granted here, as in
// every reader that hides it. Nothing needs the sum of what it does not show.
func withCombinedGrants(grants map[uuid.UUID][]PublicPlanEntitlement, rows []db.ListPublicPlanCombinedGrantsRow) {
	type key struct {
		licenseID uuid.UUID
		slug      string
	}
	type sum struct {
		first db.ListPublicPlanCombinedGrantsRow
		parts []usage.WeightedLimit
	}

	var order []key
	sums := map[key]*sum{}
	for _, row := range rows {
		threshold, err := value.ParseNumberThreshold(row.GrantValue)
		if err != nil {
			continue // a grant that is no number grants nothing to sum
		}
		weight, err := decimal.NewFromString(row.Weight)
		if err != nil {
			continue
		}
		k := key{row.LicenseID, row.Slug}
		if sums[k] == nil {
			sums[k] = &sum{first: row}
			order = append(order, k)
		}
		sums[k].parts = append(sums[k].parts, usage.WeightedLimit{Weight: weight, Threshold: threshold})
	}

	touched := map[uuid.UUID]bool{}
	for _, k := range order {
		combined := sums[k]
		limit, unlimited := usage.CombineLimits(combined.parts)
		overage := int16(0)
		if unlimited {
			overage = int16(value.UnlimitedOveragePercent)
		}
		row := combined.first
		grants[k.licenseID] = append(grants[k.licenseID], toPlanEntitlement(db.ListPublicPlanEntitlementsRow{
			LicenseID:                      row.LicenseID,
			Slug:                           row.Slug,
			Name:                           row.Name,
			Description:                    row.Description,
			Type:                           row.Type,
			Value:                          fmt.Appendf(nil, `{"type":"number","value":%s}`, limit.String()),
			LimitCapExceededOveragePercent: &overage,
			Icon:                           row.Icon,
			UnitSingular:                   row.UnitSingular,
			UnitPlural:                     row.UnitPlural,
			SaleUnitSingular:               row.SaleUnitSingular,
			SaleUnitPlural:                 row.SaleUnitPlural,
			SaleUnitFactor:                 row.SaleUnitFactor,
			DisplayOrder:                   row.DisplayOrder,
		}))
		touched[k.licenseID] = true
	}

	for licenseID := range touched {
		slices.SortStableFunc(grants[licenseID], func(a, b PublicPlanEntitlement) int {
			if a.DisplayOrder != b.DisplayOrder {
				return int(a.DisplayOrder) - int(b.DisplayOrder)
			}
			switch {
			case a.Slug < b.Slug:
				return -1
			case a.Slug > b.Slug:
				return 1
			}
			return 0
		})
	}
}
