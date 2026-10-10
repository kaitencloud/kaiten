// Package metering turns what the usage journal says about a meter into what
// the rating composer rates.
package metering

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/ports"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
)

// Measure is the rating measure of a pair's journal summary: each window
// floored at 0 and summed, the limits applied, and the fingerprint of the rows.
func Measure(summary ports.UsageSummary) rating.Measure {
	windows := make([]rating.Window, len(summary.Windows))
	for i, w := range summary.Windows {
		windows[i] = rating.Window{Usage: w.Usage, Overage: w.Overage}
	}
	limits := make([]rating.OverageLimit, len(summary.Limits))
	for i, l := range summary.Limits {
		limits[i] = rating.OverageLimit{LimitValue: nil, OveragePercent: l.OveragePercent, Rows: int(l.Rows)}
		if l.Limit != nil {
			value := money.FormatDecimal(*l.Limit)
			limits[i].LimitValue = &value
		}
	}
	return rating.MeasureWindows(windows, limits, Ledger(summary.Fingerprint))
}

// Ledger is the fingerprint as an invoice line carries it.
func Ledger(fp ports.Fingerprint) *rating.InvoiceLineLedger {
	sumOverage := money.FormatDecimal(fp.SumOverage)
	return &rating.InvoiceLineLedger{
		InstanceID: nil,
		FirstSeq:   fp.FirstSeq,
		LastSeq:    fp.LastSeq,
		Rows:       fp.Rows,
		SumDelta:   money.FormatDecimal(fp.SumDelta),
		SumOverage: &sumOverage,
	}
}

// Price is a catalogue price as the composer rates it.
func Price(cp ports.CataloguePrice) rating.Price {
	out := rating.Price{
		ID:                cp.ID,
		BillingModel:      cp.BillingModel,
		BillingTiming:     cp.BillingTiming,
		UnitAmountDecimal: cp.Amount(),
		DisplayLabel:      "",
		DisplayOrder:      cp.DisplayOrder,
		Meter:             nil,
	}
	if cp.DisplayLabel != nil {
		out.DisplayLabel = *cp.DisplayLabel
	}
	if cp.Metered != nil && cp.EntitlementID != nil {
		saleUnit := ""
		if cp.Metered.SaleUnitSingular != nil {
			saleUnit = *cp.Metered.SaleUnitSingular
		}
		out.Meter = &rating.Meter{
			EntitlementID:   *cp.EntitlementID,
			EntitlementSlug: cp.Metered.EntitlementSlug,
			EntitlementName: cp.EntitlementName,
			SaleUnitFactor:  cp.Factor(),
			SaleUnit:        saleUnit,
		}
	}
	return out
}

// Addons maps the add-ons an instance holds to what the composer bills, in
// the subscription's currency only: an add-on priced in another one cannot be
// on its invoice.
func Addons(held []ports.BillableAddon, currency string) []rating.AddonCharge {
	var out []rating.AddonCharge
	for _, addon := range held {
		if addon.Currency != currency {
			continue
		}
		out = append(out, rating.AddonCharge{
			InstanceAddonID: addon.InstanceAddonID, AddonID: addon.AddonID, Name: addon.Name, Quantity: addon.Quantity,
			Price: rating.Price{
				ID: addon.PriceID, BillingModel: rating.ModelFlatFee, BillingTiming: addon.BillingTiming,
				UnitAmountDecimal: addon.UnitAmountDecimal, DisplayLabel: addon.DisplayLabel, DisplayOrder: 0, Meter: nil,
			},
		})
	}
	return out
}

// Discounts maps the redemptions billing read to what the composer applies.
func Discounts(redeemed []ports.Discount) []rating.Discount {
	out := make([]rating.Discount, len(redeemed))
	for i, d := range redeemed {
		out[i] = rating.Discount{
			InstanceVoucherID: d.InstanceVoucherID, VoucherID: d.VoucherID, Name: d.Name, Type: d.Type, Value: d.Value,
			Currency: d.Currency, AppliesTo: d.AppliesTo, LicensePriceIDs: d.LicensePriceIDs, AddonPriceIDs: d.AddonPriceIDs,
			Applications: d.Applications, ApplicationsMax: d.ApplicationsMax,
		}
	}
	return out
}

// Consume records, for each DISCOUNT line of an issued invoice, that its
// redemption discounted one more invoice.
func Consume(ctx context.Context, source ports.DiscountSource, organizationID uuid.UUID, composition rating.Composition, now time.Time) error {
	if source == nil {
		return nil
	}
	for _, line := range composition.Lines {
		if line.Type != rating.LineDiscount || line.InstanceVoucherID == nil || line.Discount == nil {
			continue
		}
		if err := source.Applied(ctx, organizationID, *line.InstanceVoucherID, line.Discount.ApplicationsMax, now); err != nil {
			return err
		}
	}
	return nil
}
