package catalogue

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
)

// Families reads families with their versions, newest version first. The
// current version is the default, else the highest PUBLISHED one.
func Families(ctx context.Context, q *db.Queries, organizationID uuid.UUID, rows []db.AddonFamily) ([]AddonFamily, error) {
	ids := make([]uuid.UUID, len(rows))
	for i, row := range rows {
		ids[i] = row.ID
	}
	versions, err := q.ListAddonsByFamilyIDs(ctx, db.ListAddonsByFamilyIDsParams{OrganizationID: organizationID, FamilyIds: ids})
	if err != nil {
		return nil, err
	}
	byFamily := map[uuid.UUID][]Addon{}
	for _, v := range versions {
		byFamily[v.FamilyID] = append(byFamily[v.FamilyID], ToAddon(db.Addon{
			ID: v.ID, OrganizationID: v.OrganizationID, FamilyID: v.FamilyID, Name: v.Name, Slug: v.Slug,
			Description: v.Description, Version: v.Version, VersionName: v.VersionName, IsDefault: v.IsDefault,
			LifecycleState: v.LifecycleState, PricingType: v.PricingType, MaxQuantity: v.MaxQuantity,
			CreatedAt: v.CreatedAt, CreatedByID: v.CreatedByID, UpdatedAt: v.UpdatedAt, UpdatedByID: v.UpdatedByID,
		}, v.FamilySlug))
	}
	families := make([]AddonFamily, len(rows))
	for i, row := range rows {
		family := AddonFamily{
			ID: row.ID, Slug: row.Slug, IsPublic: row.IsPublic, LastVersion: row.LastVersion,
			CurrentVersion: nil, Versions: byFamily[row.ID],
		}
		if family.Versions == nil {
			family.Versions = []Addon{}
		}
		family.CurrentVersion = current(family.Versions)
		families[i] = family
	}
	return families, nil
}

func current(versions []Addon) *Addon {
	for i := range versions {
		if versions[i].IsDefault {
			return &versions[i]
		}
	}
	for i := range versions {
		if versions[i].LifecycleState == Published {
			return &versions[i]
		}
	}
	return nil
}

// Prices reads the prices of the given versions, in display order, keyed by
// version.
func Prices(ctx context.Context, q *db.Queries, organizationID uuid.UUID, addonIDs []uuid.UUID, status *db.PriceStatus) (map[uuid.UUID][]prices.Price, error) {
	rows, err := q.ListAddonPrices(ctx, db.ListAddonPricesParams{OrganizationID: organizationID, AddonIds: addonIDs, Status: status})
	if err != nil {
		return nil, err
	}
	out := map[uuid.UUID][]prices.Price{}
	for _, row := range rows {
		out[row.AddonID] = append(out[row.AddonID], ToPrice(row))
	}
	return out, nil
}

// ToPrice maps a price row to the licence price shape, which an add-on price
// shares.
func ToPrice(row db.ListAddonPricesRow) prices.Price {
	amount, _ := decimal.NewFromString(row.UnitAmountDecimal)
	price := prices.Price{
		ID: row.ID, BillingModel: string(row.BillingModel), BillingTiming: string(row.BillingTiming),
		BillingPeriod: nil, Currency: row.Currency, UnitAmount: nil, UnitAmountDecimal: money.FormatDecimal(amount),
		Metered: nil, DisplayLabel: row.DisplayLabel, DisplayOrder: row.DisplayOrder, IsDefault: row.IsDefault,
		Status: string(row.Status), DeprecatedAt: nil, CreatedAt: row.CreatedAt.Time.UTC(), UpdatedAt: row.UpdatedAt.Time.UTC(),
	}
	if row.BillingPeriod != nil {
		period := string(*row.BillingPeriod)
		price.BillingPeriod = &period
	}
	if minor, ok := money.IntegralMinor(amount); ok {
		price.UnitAmount = &minor
	}
	if row.MetersEntitlementID != nil && row.EntitlementSlug != nil {
		factor, _ := decimal.NewFromString(row.SaleUnitFactor)
		price.Metered = &prices.PriceMeter{
			EntitlementSlug: *row.EntitlementSlug, SaleUnitFactor: money.FormatDecimal(factor),
			SaleUnitSingular: row.SaleUnitSingular, SaleUnitPlural: row.SaleUnitPlural,
		}
	}
	if row.DeprecatedAt.Valid {
		at := row.DeprecatedAt.Time.UTC()
		price.DeprecatedAt = &at
	}
	return price
}

// ToGrant maps a grant row.
func ToGrant(row db.ListAddonEntitlementsRow) AddonEntitlement {
	value := map[string]any{}
	_ = json.Unmarshal(row.Value, &value)
	return AddonEntitlement{
		ID: row.ID, EntitlementSlug: row.EntitlementSlug, EntitlementType: string(row.EntitlementType), Value: value,
		OverrideBehavior: string(row.OverrideBehavior), LimitCapExceededOveragePercent: row.LimitCapExceededOveragePercent,
	}
}
