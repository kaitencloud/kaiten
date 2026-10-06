package previewlicenseinvoice

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "PreviewLicenseInvoice"

// Scenario is what to preview: which base price, and how much of each metered
// entitlement was used.
type Scenario struct {
	BasePriceID *uuid.UUID
	SampleUsage []Sample
}

// Sample is a quantity of one metered entitlement, in its measured units.
type Sample struct {
	EntitlementSlug string
	Quantity        string
}

type UseCase struct {
	deps prices.Deps
}

func NewUseCase(deps prices.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute composes the RENEWAL a subscription to the version would be billed
// at a boundary now: the sample usage rated in arrears over the period that
// ends, the base price in advance or in arrears as it says. It writes
// nothing, and works on a DRAFT version, which is how a price is checked
// before it is published.
func (u *UseCase) Execute(ctx context.Context, licenseSlug string, scenario Scenario) (*rating.InvoicePreview, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	samples, err := parseSamples(scenario.SampleUsage)
	if err != nil {
		return nil, err
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

	in := rating.Input{
		Kind:        rating.KindRenewal,
		Currency:    money.Currency(base.Currency),
		LicenseName: version.Name,
		Base:        ratingPrice(base, nil),
		Metered:     nil,
		Measures:    map[uuid.UUID]rating.Measure{},
		Advance:     rating.Period{},
		Arrears:     rating.Period{},
	}
	bySlug := make(map[string]db.ListMeteredGrantsRow, len(grants))
	for _, grant := range grants {
		bySlug[grant.Slug] = grant
	}
	for _, price := range all {
		if price.Status != prices.StatusActive || price.Metered == nil {
			continue
		}
		grant, ok := bySlug[price.Metered.EntitlementSlug]
		if !ok {
			continue
		}
		in.Metered = append(in.Metered, ratingPrice(price, &grant))
	}
	for slug, quantity := range samples {
		grant, ok := bySlug[slug]
		if !ok {
			return nil, kaitenerrors.UnprocessableEntity(operation+".InvalidSampleUsage",
				"no active price of this version meters "+slug)
		}
		in.Measures[grant.ID] = rating.Sample(quantity, toGrant(grant))
	}

	clock, err := queries.BillingClock(ctx)
	if err != nil {
		return nil, err
	}
	boundary := clock.Time.UTC()
	months := 1
	if base.BillingPeriod != nil {
		months = rating.PeriodMonths(*base.BillingPeriod)
	}
	in.Advance = rating.Period{From: boundary, To: rating.AddMonthsClamped(boundary, months)}
	in.Arrears = rating.Period{From: rating.AddMonthsClamped(boundary, -months), To: boundary}

	composition, err := rating.Compose(in)
	if errors.Is(err, rating.ErrAmountOverflow) {
		return nil, kaitenerrors.Internal("ComposeInvoice.AmountOverflow", "an invoice amount overflows 64-bit minor units")
	}
	if err != nil {
		return nil, err
	}
	preview := rating.Preview(rating.KindRenewal, boundary, boundary, licenseSlug, base.Currency, composition)
	return &preview, nil
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

// toGrant reads the version's grant of a metered entitlement. No grant, or a
// limit of -1, is unlimited.
func toGrant(row db.ListMeteredGrantsRow) rating.Grant {
	unlimited := rating.Grant{Limit: decimal.Zero, Unlimited: true, OveragePercent: -1}
	if row.GrantValue == nil || row.GrantOveragePercent == nil {
		return unlimited
	}
	var value struct {
		Value json.Number `json:"value"`
	}
	if json.Unmarshal(row.GrantValue, &value) != nil {
		return unlimited
	}
	limit, err := decimal.NewFromString(value.Value.String())
	if err != nil || limit.IsNegative() {
		return unlimited
	}
	return rating.Grant{Limit: limit, Unlimited: false, OveragePercent: int32(*row.GrantOveragePercent)}
}
