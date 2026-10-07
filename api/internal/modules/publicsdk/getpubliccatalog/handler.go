package getpubliccatalog

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/publicsdk/infrastructure/db"
)

// Deps is what the catalogue reads.
type Deps struct {
	Uof *uow.UnitOfWork
	// Gate keeps the priced catalogue behind the billing switch, as the
	// licence price routes are.
	Gate gate.Gate
	// Providers answers whether the organization sells through a provider that
	// captures payment methods. Nil on a deployment without billing providers.
	Providers provider.Registry
}

// Query narrows the catalogue.
type Query struct {
	// FamilySlug, when set, lists that one licence family.
	FamilySlug *string
	// IncludeAddOns lists the add-on families too.
	IncludeAddOns bool
}

type UseCase struct{ deps Deps }

func NewUseCase(deps Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads the organization's public catalogue. The organization comes
// from the publishable key, through the facade, never from the request.
func (u *UseCase) Execute(ctx context.Context, organizationID uuid.UUID, query Query) (*PublicCatalog, error) {
	if err := u.deps.Gate.Require(ctx, organizationID); err != nil {
		return nil, err
	}
	q := db.New(u.deps.Uof.DBTX(ctx))

	captures := u.capturesPaymentMethods(ctx, organizationID)
	out := &PublicCatalog{
		Plans:        []PublicPlan{},
		AddOns:       []PublicAddOn{},
		Capabilities: PublicCatalogCapabilities{Checkout: false, PaymentMethods: captures},
	}

	plans, err := q.ListPublicPlans(ctx, db.ListPublicPlansParams{OrganizationID: organizationID, FamilySlug: query.FamilySlug})
	if err != nil {
		return nil, err
	}
	var addons []db.ListPublicAddonsRow
	if query.IncludeAddOns {
		if addons, err = q.ListPublicAddons(ctx, organizationID); err != nil {
			return nil, err
		}
	}
	addOns, compatibleAddons, err := u.addOns(ctx, q, organizationID, addons)
	if err != nil {
		return nil, err
	}
	out.AddOns = addOns
	if len(plans) == 0 {
		return out, nil
	}

	licenseIDs := make([]uuid.UUID, 0, len(plans))
	for _, p := range plans {
		licenseIDs = append(licenseIDs, p.ID)
	}
	priceRows, err := q.ListPublicPlanPrices(ctx, db.ListPublicPlanPricesParams{OrganizationID: organizationID, LicenseIds: licenseIDs})
	if err != nil {
		return nil, err
	}
	grantRows, err := q.ListPublicPlanEntitlements(ctx, db.ListPublicPlanEntitlementsParams{OrganizationID: organizationID, LicenseIds: licenseIDs})
	if err != nil {
		return nil, err
	}
	pricesByLicense := map[uuid.UUID][]PublicPrice{}
	for _, r := range priceRows {
		pricesByLicense[r.LicenseID] = append(pricesByLicense[r.LicenseID], toPrice(r))
	}
	grantsByLicense := map[uuid.UUID][]PublicPlanEntitlement{}
	for _, r := range grantRows {
		grantsByLicense[r.LicenseID] = append(grantsByLicense[r.LicenseID], toPlanEntitlement(r))
	}

	for _, p := range plans {
		plan := PublicPlan{
			FamilySlug:              p.FamilySlug,
			LicenseSlug:             p.Slug,
			LicenseID:               p.ID.String(),
			Name:                    p.Name,
			Description:             p.Description,
			LifecycleState:          string(p.LifecycleState),
			PricingType:             string(p.PricingType),
			TrialPeriodDays:         p.TrialPeriodDays,
			RequiresPaymentMethod:   p.RequiresPaymentMethod,
			SelfServe:               false,
			SelfServeCtaURL:         p.SelfServeCtaUrl,
			Currency:                nil,
			Prices:                  nonNil(pricesByLicense[p.ID]),
			CompatibleAddonFamilies: nonNil(compatibleAddons[p.FamilySlug]),
			Entitlements:            nonNil(grantsByLicense[p.ID]),
		}
		if len(plan.Prices) > 0 {
			currency := plan.Prices[0].Currency
			plan.Currency = &currency
		}
		plan.SelfServe = selfServe(plan, captures)
		out.Plans = append(out.Plans, plan)
	}
	return out, nil
}

// selfServe is §14.4's rule: not CUSTOM, a default ACTIVE flat-fee price, and
// either FREE or sold through a provider that captures payment methods.
func selfServe(plan PublicPlan, capturesPaymentMethods bool) bool {
	if plan.PricingType == string(db.PricingTypeCUSTOM) {
		return false
	}
	hasDefaultFlatFee := false
	for _, p := range plan.Prices {
		if p.IsDefault && p.BillingModel == string(db.BillingModelFLATFEE) {
			hasDefaultFlatFee = true
			break
		}
	}
	return hasDefaultFlatFee && (plan.PricingType == string(db.PricingTypeFREE) || capturesPaymentMethods)
}

// capturesPaymentMethods reports whether the organization has connected a
// provider that captures payment methods. A provider that cannot be resolved
// reads as not connected: the catalogue still answers, with self-serve off.
func (u *UseCase) capturesPaymentMethods(ctx context.Context, organizationID uuid.UUID) bool {
	if u.deps.Providers == nil {
		return false
	}
	for _, kind := range u.deps.Providers.Kinds() {
		capabilities, ok := u.deps.Providers.Capabilities(kind)
		if !ok || !capabilities.PaymentMethodCapture {
			continue
		}
		if _, err := u.deps.Providers.Resolve(ctx, organizationID, kind); err == nil {
			return true
		} else {
			slog.DebugContext(ctx, "publicsdk: provider not connected", "provider", kind, "error", err)
		}
	}
	return false
}

// addOns builds the public add-ons and, per public licence family slug, the
// add-on families that fit it.
func (u *UseCase) addOns(ctx context.Context, q *db.Queries, organizationID uuid.UUID, rows []db.ListPublicAddonsRow) ([]PublicAddOn, map[string][]string, error) {
	out := []PublicAddOn{}
	byLicenseFamily := map[string][]string{}
	if len(rows) == 0 {
		return out, byLicenseFamily, nil
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	priceRows, err := q.ListPublicAddonPrices(ctx, db.ListPublicAddonPricesParams{OrganizationID: organizationID, AddonIds: ids})
	if err != nil {
		return nil, nil, err
	}
	grantRows, err := q.ListPublicAddonEntitlements(ctx, db.ListPublicAddonEntitlementsParams{OrganizationID: organizationID, AddonIds: ids})
	if err != nil {
		return nil, nil, err
	}
	fitRows, err := q.ListPublicAddonCompatibility(ctx, db.ListPublicAddonCompatibilityParams{OrganizationID: organizationID, AddonIds: ids})
	if err != nil {
		return nil, nil, err
	}
	prices := map[uuid.UUID][]PublicPrice{}
	for _, r := range priceRows {
		prices[r.AddonID] = append(prices[r.AddonID], toPrice(r))
	}
	grants := map[uuid.UUID][]PublicAddOnEntitlement{}
	for _, r := range grantRows {
		grants[r.AddonID] = append(grants[r.AddonID], PublicAddOnEntitlement{
			Slug:                           r.Slug,
			Name:                           r.Name,
			Type:                           string(r.Type),
			Value:                          innerValue(r.Value),
			OverrideBehavior:               string(r.OverrideBehavior),
			LimitCapExceededOveragePercent: widen(r.LimitCapExceededOveragePercent),
		})
	}
	fits := map[uuid.UUID][]string{}
	familyOf := map[uuid.UUID]string{}
	for _, r := range rows {
		familyOf[r.ID] = r.FamilySlug
	}
	for _, r := range fitRows {
		fits[r.AddonID] = append(fits[r.AddonID], r.LicenseFamilySlug)
		byLicenseFamily[r.LicenseFamilySlug] = append(byLicenseFamily[r.LicenseFamilySlug], familyOf[r.AddonID])
	}
	for _, r := range rows {
		out = append(out, PublicAddOn{
			FamilySlug:                r.FamilySlug,
			AddonSlug:                 r.Slug,
			AddonID:                   r.ID.String(),
			Name:                      r.Name,
			Description:               r.Description,
			PricingType:               string(r.PricingType),
			MaxQuantity:               r.MaxQuantity,
			Prices:                    nonNil(prices[r.ID]),
			Entitlements:              nonNil(grants[r.ID]),
			CompatibleLicenseFamilies: nonNil(fits[r.ID]),
		})
	}
	return out, byLicenseFamily, nil
}

// priceRow is the one shape both price queries return.
type priceRow struct {
	ID                uuid.UUID
	BillingModel      db.BillingModel
	BillingTiming     db.BillingTiming
	BillingPeriod     *db.BillingPeriod
	UnitAmountDecimal string
	Currency          string
	SaleUnitFactor    string
	EntitlementSlug   *string
	SaleUnitSingular  *string
	SaleUnitPlural    *string
	DisplayLabel      *string
	DisplayOrder      int32
	IsDefault         bool
}

func toPrice[T db.ListPublicPlanPricesRow | db.ListPublicAddonPricesRow](row T) PublicPrice {
	r := asPriceRow(row)
	amount, _ := decimal.NewFromString(r.UnitAmountDecimal)
	price := PublicPrice{
		ID:                r.ID.String(),
		BillingModel:      string(r.BillingModel),
		BillingTiming:     string(r.BillingTiming),
		BillingPeriod:     nil,
		Currency:          r.Currency,
		UnitAmount:        nil,
		UnitAmountDecimal: money.FormatDecimal(amount),
		Metered:           nil,
		DisplayLabel:      r.DisplayLabel,
		DisplayOrder:      r.DisplayOrder,
		IsDefault:         r.IsDefault,
	}
	if r.BillingPeriod != nil {
		period := string(*r.BillingPeriod)
		price.BillingPeriod = &period
	}
	if minor, ok := money.IntegralMinor(amount); ok {
		price.UnitAmount = &minor
	}
	if r.EntitlementSlug != nil {
		factor, _ := decimal.NewFromString(r.SaleUnitFactor)
		if r.SaleUnitFactor == "" {
			factor = decimal.NewFromInt(1)
		}
		price.Metered = &PublicMeter{
			EntitlementSlug:  *r.EntitlementSlug,
			SaleUnitFactor:   money.FormatDecimal(factor),
			SaleUnitSingular: r.SaleUnitSingular,
			SaleUnitPlural:   r.SaleUnitPlural,
		}
	}
	return price
}

func asPriceRow[T db.ListPublicPlanPricesRow | db.ListPublicAddonPricesRow](row T) priceRow {
	switch r := any(row).(type) {
	case db.ListPublicPlanPricesRow:
		return priceRow{r.ID, r.BillingModel, r.BillingTiming, r.BillingPeriod, r.UnitAmountDecimal, r.Currency,
			r.SaleUnitFactor, r.EntitlementSlug, r.SaleUnitSingular, r.SaleUnitPlural, r.DisplayLabel, r.DisplayOrder, r.IsDefault}
	case db.ListPublicAddonPricesRow:
		return priceRow{r.ID, r.BillingModel, r.BillingTiming, r.BillingPeriod, r.UnitAmountDecimal, r.Currency,
			r.SaleUnitFactor, r.EntitlementSlug, r.SaleUnitSingular, r.SaleUnitPlural, r.DisplayLabel, r.DisplayOrder, r.IsDefault}
	}
	panic("unreachable: the type set has two members")
}

func toPlanEntitlement(r db.ListPublicPlanEntitlementsRow) PublicPlanEntitlement {
	grant := PublicPlanEntitlement{
		Slug:                           r.Slug,
		Name:                           r.Name,
		Description:                    r.Description,
		Type:                           string(r.Type),
		Value:                          innerValue(r.Value),
		Unlimited:                      isUnlimited(r.Value),
		LimitCapExceededOveragePercent: widen(r.LimitCapExceededOveragePercent),
		Icon:                           r.Icon,
		UnitSingular:                   r.UnitSingular,
		UnitPlural:                     r.UnitPlural,
		SaleUnitSingular:               r.SaleUnitSingular,
		SaleUnitPlural:                 r.SaleUnitPlural,
		SaleUnitFactor:                 nil,
		DisplayOrder:                   r.DisplayOrder,
	}
	if r.SaleUnitFactor != "" {
		factor, _ := decimal.NewFromString(r.SaleUnitFactor)
		formatted := money.FormatDecimal(factor)
		grant.SaleUnitFactor = &formatted
	}
	return grant
}

// innerValue unwraps the stored {"type": ..., "value": ...} to its value.
func innerValue(raw []byte) json.RawMessage {
	var stored struct {
		Value json.RawMessage `json:"value"`
	}
	if err := json.Unmarshal(raw, &stored); err != nil || stored.Value == nil {
		return json.RawMessage("null")
	}
	return stored.Value
}

func isUnlimited(raw []byte) bool {
	var stored map[string]any
	if err := json.Unmarshal(raw, &stored); err != nil {
		return false
	}
	return value.IsUnlimitedValue(stored)
}

func widen(v *int16) *int32 {
	if v == nil {
		return nil
	}
	w := int32(*v)
	return &w
}

func nonNil[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}
