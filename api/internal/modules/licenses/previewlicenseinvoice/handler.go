package previewlicenseinvoice

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/effective"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "PreviewLicenseInvoice"

// Scenario is what to preview (§8.9): which base price; the instance whose
// usage is rated, or a sample of it; the add-ons and the voucher to price in.
type Scenario struct {
	BasePriceID  *uuid.UUID
	InstanceSlug *string
	SampleUsage  []Sample
	AddOns       []AddonQuantity
	VoucherCode  *string
}

// Sample is a quantity of one metered entitlement, in its measured units.
type Sample struct {
	EntitlementSlug string
	Quantity        string
}

// AddonQuantity is an add-on version the preview prices in, and how many.
type AddonQuantity struct {
	AddonSlug string
	Quantity  int32
}

type UseCase struct {
	deps    prices.Deps
	sources Sources
}

// NewUseCase builds the preview; sources may be nil, and a preview then takes
// a sample only.
func NewUseCase(deps prices.Deps, sources Sources) *UseCase {
	return &UseCase{deps: deps, sources: sources}
}

// meter is an entitlement a price of the preview meters.
type meter struct {
	id   uuid.UUID
	slug string
}

// Execute composes the RENEWAL a subscription to the version would be billed
// at a boundary now, writing nothing, on a DRAFT version too (how a price is
// checked before it is published):
//   - the base price in advance, or in arrears as it says;
//   - the listed add-ons' fees, and their metered prices;
//   - the metered usage of the period that ends: the instance's own, read
//     from its journal over [P0, now), or the sample, rated against the
//     version's grant with the listed add-ons' (§7.2);
//   - the voucher's discount, as a redemption would apply it, consuming
//     nothing.
func (u *UseCase) Execute(ctx context.Context, licenseSlug string, scenario Scenario) (*rating.InvoicePreview, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	samples, err := parseSamples(scenario.SampleUsage)
	if err != nil {
		return nil, err
	}
	if scenario.InstanceSlug != nil && len(samples) > 0 {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidSampleUsage",
			"rate an instance's usage (instanceSlug) or a sample (sampleUsage), not both")
	}
	if (scenario.InstanceSlug != nil || len(scenario.AddOns) > 0 || scenario.VoucherCode != nil) && u.sources == nil {
		return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidSampleUsage",
			"this deployment previews a sample only")
	}

	queries := u.deps.Queries(ctx)
	version, err := queries.GetLicenseIDBySlug(ctx, db.GetLicenseIDBySlugParams{OrganizationID: user.OrganizationID, Slug: licenseSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.NotFoundf(operation+".LicenseNotFound", "license %q not found", licenseSlug)
	}
	if err != nil {
		return nil, err
	}
	all, err := prices.List(ctx, queries, user.OrganizationID, version.ID, "", "")
	if err != nil {
		return nil, err
	}
	base, err := basePrice(all, scenario.BasePriceID)
	if err != nil {
		return nil, err
	}
	grants, err := queries.ListMeteredGrants(ctx, db.ListMeteredGrantsParams{OrganizationID: user.OrganizationID, LicenseID: version.ID})
	if err != nil {
		return nil, err
	}
	period := "MONTHLY"
	if base.BillingPeriod != nil {
		period = *base.BillingPeriod
	}

	clock, err := queries.BillingClock(ctx)
	if err != nil {
		return nil, err
	}
	now := clock.Time.UTC()
	months := rating.PeriodMonths(period)
	in := rating.Input{
		Kind: rating.KindRenewal, Currency: money.Currency(base.Currency), LicenseName: version.Name,
		Base: ratingPrice(base, nil), Metered: nil, Measures: map[uuid.UUID]rating.Measure{}, Addons: nil, AddonMetered: nil,
		Advance: rating.Period{From: now, To: rating.AddMonthsClamped(now, months)},
		Arrears: rating.Period{From: rating.AddMonthsClamped(now, -months), To: now},
	}

	// The version's metered prices, and the entitlements they meter.
	bySlug := make(map[string]db.ListMeteredGrantsRow, len(grants))
	for _, grant := range grants {
		bySlug[grant.Slug] = grant
	}
	meters := map[string]meter{}
	for _, price := range all {
		if price.Status != prices.StatusActive || price.Metered == nil {
			continue
		}
		grant, ok := bySlug[price.Metered.EntitlementSlug]
		if !ok {
			continue
		}
		in.Metered = append(in.Metered, ratingPrice(price, &grant))
		meters[grant.Slug] = meter{id: grant.ID, slug: grant.Slug}
	}

	// The listed add-ons: their fees and metered prices, and their grants
	// for the sample's effective grant. Listed later counts as attached
	// later.
	addonGrants := map[uuid.UUID][]effective.AddonGrant{}
	listed := map[string]bool{}
	for i, wanted := range scenario.AddOns {
		if wanted.Quantity < 1 || listed[wanted.AddonSlug] {
			return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidAddOns",
				"addOns names each add-on version once, with a quantity of at least 1")
		}
		listed[wanted.AddonSlug] = true
		addon, err := u.sources.Addon(ctx, user.OrganizationID, wanted.AddonSlug, period, base.Currency)
		if err != nil {
			return nil, err
		}
		if addon == nil {
			return nil, kaitenerrors.NotFoundf(operation+".AddonNotFound", "add-on version %q not found", wanted.AddonSlug)
		}
		if addon.Flat != nil {
			in.Addons = append(in.Addons, rating.AddonCharge{
				InstanceAddonID: uuid.Nil, AddonID: addon.ID, Name: addon.Name, Quantity: wanted.Quantity, Price: *addon.Flat, Service: nil,
			})
		}
		for _, price := range addon.Metered {
			in.AddonMetered = append(in.AddonMetered, rating.AddonMeter{
				InstanceAddonID: uuid.Nil, AddonID: addon.ID, Price: price, Window: in.Arrears, Measure: rating.Measure{},
			})
			meters[price.Meter.EntitlementSlug] = meter{id: price.Meter.EntitlementID, slug: price.Meter.EntitlementSlug}
		}
		for _, grant := range addon.Grants {
			g := grant.Grant
			g.Quantity, g.AttachedAt = wanted.Quantity, now.Add(time.Duration(i)*time.Millisecond)
			addonGrants[grant.EntitlementID] = append(addonGrants[grant.EntitlementID], g)
		}
	}

	switch {
	case scenario.InstanceSlug != nil:
		if err := u.measureInstance(ctx, user.OrganizationID, *scenario.InstanceSlug, meters, &in, now); err != nil {
			return nil, err
		}
	default:
		for slug, quantity := range samples {
			m, ok := meters[slug]
			if !ok {
				return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidSampleUsage",
					"no active price of this version or of the listed add-ons meters "+slug)
			}
			var licence *effective.LicenceGrant
			if grant, ok := bySlug[slug]; ok && grant.GrantValue != nil {
				licence = &effective.LicenceGrant{Value: grant.GrantValue, Pct: grant.GrantOveragePercent}
			}
			in.Measures[m.id] = rating.Sample(quantity, grantOf(licence, addonGrants[m.id], now))
		}
	}
	for i := range in.AddonMetered {
		in.AddonMetered[i].Measure = in.Measures[in.AddonMetered[i].Price.Meter.EntitlementID]
	}

	composition, err := rating.Compose(in)
	if errors.Is(err, rating.ErrAmountOverflow) {
		return nil, kaitenerrors.Internal("ComposeInvoice.AmountOverflow", "an invoice amount overflows 64-bit minor units")
	}
	if err != nil {
		return nil, err
	}
	if scenario.VoucherCode != nil {
		discount, found, err := u.sources.Discount(ctx, user.OrganizationID, *scenario.VoucherCode)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, kaitenerrors.NotFound(operation+".VoucherNotFound", "no voucher has this code")
		}
		if discount == nil {
			return nil, kaitenerrors.UnprocessableEntity(operation+".VoucherInvalid", "the voucher is not an ACTIVE PRICE voucher")
		}
		if composition, err = rating.ApplyDiscounts(composition, []rating.Discount{*discount}, money.Currency(base.Currency)); err != nil {
			return nil, err
		}
	}
	preview := rating.Preview(rating.KindRenewal, now, now, licenseSlug, base.Currency, composition)
	return &preview, nil
}

// measureInstance rates the instance's own usage of every meter over
// [P0, now): P0 of its live subscription, else one period back (§8.9).
func (u *UseCase) measureInstance(ctx context.Context, organizationID uuid.UUID, slug string, meters map[string]meter, in *rating.Input, now time.Time) error {
	instance, err := u.sources.Instance(ctx, organizationID, slug)
	if err != nil {
		return err
	}
	if instance == nil {
		return kaitenerrors.NotFoundf(operation+".InstanceNotFound", "instance %q not found", slug)
	}
	if instance.PeriodStart != nil && instance.PeriodStart.Before(now) {
		in.Arrears.From = *instance.PeriodStart
		for i := range in.AddonMetered {
			in.AddonMetered[i].Window = in.Arrears
		}
	}
	if len(meters) == 0 {
		return nil
	}
	if start := u.sources.RetentionStart(ctx, organizationID, now); start != nil && in.Arrears.From.Before(*start) {
		return kaitenerrors.UnprocessableEntityWithErrors(operation+".OutsideRetention",
			"the period starts before the organization's usage history: its usage reports are gone",
			&kaitenerrors.ErrorDetail{Message: "retentionStart", Location: "retentionStart", Value: start.UTC().Format(time.RFC3339Nano)})
	}
	for _, m := range meters {
		measure, err := u.sources.Measure(ctx, organizationID, instance.ID, m.id, in.Arrears.From, now)
		if err != nil {
			return err
		}
		in.Measures[m.id] = measure
	}
	return nil
}

// grantOf is a sample's grant: the version's, with the listed add-ons'
// (§7.2, §7.3). No grant at all, or a value of -1, is unlimited.
func grantOf(licence *effective.LicenceGrant, addons []effective.AddonGrant, now time.Time) rating.Grant {
	unlimited := rating.Grant{Limit: decimal.Zero, Unlimited: true, OveragePercent: -1}
	resolved, ok := effective.Resolve(effective.Input{Type: effective.TypeNumber, Licence: licence, Addons: addons, Boosts: nil, At: now})
	if !ok || resolved.Pct == nil {
		return unlimited
	}
	var value struct {
		Value json.Number `json:"value"`
	}
	if json.Unmarshal(resolved.Value, &value) != nil {
		return unlimited
	}
	limit, err := decimal.NewFromString(value.Value.String())
	if err != nil || limit.IsNegative() {
		return unlimited
	}
	return rating.Grant{Limit: limit, Unlimited: false, OveragePercent: int32(*resolved.Pct)}
}

// parseSamples reads the sample quantities: non-negative decimals, one per
// entitlement.
func parseSamples(samples []Sample) (map[string]decimal.Decimal, error) {
	out := make(map[string]decimal.Decimal, len(samples))
	for _, sample := range samples {
		quantity, err := decimal.NewFromString(sample.Quantity)
		if err != nil || quantity.IsNegative() {
			return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidSampleUsage",
				"a sample quantity is a non-negative decimal string, in the entitlement's measured units")
		}
		if _, seen := out[sample.EntitlementSlug]; seen {
			return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidSampleUsage",
				"sampleUsage names "+sample.EntitlementSlug+" twice")
		}
		out[sample.EntitlementSlug] = quantity
	}
	return out, nil
}

// basePrice is the FLAT_FEE price the preview bills as its base: the one
// named, else the version's first ACTIVE default in display order.
func basePrice(all []prices.Price, id *uuid.UUID) (prices.Price, error) {
	if id != nil {
		for _, price := range all {
			if price.ID == *id && price.BillingModel == prices.ModelFlatFee {
				return price, nil
			}
		}
		return prices.Price{}, kaitenerrors.NotFoundf(operation+".PriceNotFound",
			"basePriceId %s is not a FLAT_FEE price of this version", *id)
	}
	for _, price := range all {
		if price.IsDefault && price.Status == prices.StatusActive && price.BillingModel == prices.ModelFlatFee {
			return price, nil
		}
	}
	return prices.Price{}, kaitenerrors.UnprocessableEntity(operation+".NoBasePrice",
		"this version has no default FLAT_FEE price: name one with basePriceId")
}

func ratingPrice(price prices.Price, grant *db.ListMeteredGrantsRow) rating.Price {
	out := rating.Price{
		ID:                price.ID,
		BillingModel:      price.BillingModel,
		BillingTiming:     price.BillingTiming,
		UnitAmountDecimal: price.Amount(),
		DisplayLabel:      "",
		DisplayOrder:      price.DisplayOrder,
		Meter:             nil,
	}
	if price.DisplayLabel != nil {
		out.DisplayLabel = *price.DisplayLabel
	}
	if price.Metered != nil && grant != nil {
		saleUnit := ""
		if price.Metered.SaleUnitSingular != nil {
			saleUnit = *price.Metered.SaleUnitSingular
		}
		out.Meter = &rating.Meter{
			EntitlementID:   grant.ID,
			EntitlementSlug: grant.Slug,
			EntitlementName: grant.Name,
			SaleUnitFactor:  price.Factor(),
			SaleUnit:        saleUnit,
		}
	}
	return out
}
