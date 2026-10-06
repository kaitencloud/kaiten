// Package rating composes the lines and totals of an invoice from the prices it
// bills and what their meters measured.
//
// It is pure: it reads nothing, writes nothing and asks no clock. Every caller
// -- a preview today, the period close later -- gathers the same inputs and gets
// the same lines, so a preview and the invoice issued from the same inputs
// cannot disagree. Intervals are half-open and instants UTC.
//
// Amounts are integer minor units throughout. A price's unit amount is already
// in minor units, so a line's amount is round_half_up(quantity × unit amount)
// whatever the currency's exponent; the exponent only matters for display.
package rating

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
)

// Kind is which boundary an invoice bills.
type Kind string

const (
	// KindActivation bills the first period in advance.
	KindActivation Kind = "ACTIVATION"
	// KindRenewal bills the period that ended in arrears and the one that
	// starts in advance.
	KindRenewal Kind = "RENEWAL"
	// KindFinal bills what is left in arrears when a subscription ends.
	KindFinal Kind = "FINAL"
)

// LineType is what a line bills.
type LineType string

const (
	LineBase    LineType = "BASE"
	LineUsage   LineType = "USAGE"
	LineOverage LineType = "OVERAGE"
)

// typeRank orders lines that share a service start: BASE, add-ons, USAGE,
// OVERAGE. Add-ons are not composed yet but keep their place.
var typeRank = map[LineType]int{LineBase: 0, LineUsage: 2, LineOverage: 3}

// Billing models and timings, as prices spell them.
const (
	ModelFlatFee    = "FLAT_FEE"
	ModelUsageBased = "USAGE_BASED"
	ModelOverage    = "OVERAGE"

	TimingAdvance = "ADVANCE"
	TimingArrears = "ARREARS"
)

// ErrAmountOverflow is a line amount or a total beyond int64 minor units.
var ErrAmountOverflow = errors.New("invoice amount overflows int64 minor units")

// Period is a half-open interval [From, To).
type Period struct {
	From time.Time
	To   time.Time
}

func (p Period) empty() bool { return !p.From.Before(p.To) }

// Price is what the composer needs of a price: the members a line snapshots.
type Price struct {
	ID                uuid.UUID
	BillingModel      string
	BillingTiming     string
	UnitAmountDecimal decimal.Decimal
	// DisplayLabel is the line's label; "" derives one.
	DisplayLabel string
	DisplayOrder int32
	// Meter is set on a USAGE_BASED or OVERAGE price.
	Meter *Meter
}

// Meter is the entitlement a metered price measures.
type Meter struct {
	EntitlementID   uuid.UUID
	EntitlementSlug string
	EntitlementName string
	// SaleUnitFactor is the measured units in one sale unit, as captured on the
	// price.
	SaleUnitFactor decimal.Decimal
	// SaleUnit names one sale unit in a description ("10k tokens"); "" when the
	// entitlement has none.
	SaleUnit string
}

// Measure is what one meter measured over the arrears period, in measured
// units, with each window's net movement floored at 0.
type Measure struct {
	Usage   decimal.Decimal
	Overage decimal.Decimal
	Windows int
	// NegativeSegmentsFloored counts the windows whose usage moved down and
	// were counted as 0; OverageFloored the same for the overage.
	NegativeSegmentsFloored int
	OverageFloored          int
	Limits                  []OverageLimit
	// Ledger identifies the journal rows the measure was summed from; nil for
	// a sample.
	Ledger *InvoiceLineLedger
	// Unlimited is set when no limit applied anywhere in the period: an
	// OVERAGE price then bills nothing.
	Unlimited bool
	// Capped is set when a sample exceeded what the licence accepts; reports
	// above it would have been rejected, so the excess is not rated.
	Capped bool
}

// Input is everything one composition reads.
type Input struct {
	Kind        Kind
	Currency    money.Currency
	LicenseName string
	// Base is the subscription's FLAT_FEE price.
	Base Price
	// Metered are the ACTIVE metered prices rated over Arrears.
	Metered []Price
	// Measures holds each meter's measure, by entitlement id. A meter with
	// none measured nothing.
	Measures map[uuid.UUID]Measure
	// Advance is the period an ADVANCE line bills: the one starting at the
	// boundary.
	Advance Period
	// Arrears is the period an ARREARS line bills: the one ending at it.
	Arrears Period
}

// Composition is an invoice's lines and totals.
type Composition struct {
	Lines         []InvoiceLine
	Subtotal      int64
	DiscountTotal int64
	Total         int64
}

// Compose rates in into lines, ordered by service start, type, the price's
// display order and its id, numbered from 1, and totals them.
func Compose(in Input) (Composition, error) {
	var lines []InvoiceLine

	baseInAdvance := in.Base.BillingTiming != TimingArrears
	switch {
	case baseInAdvance && (in.Kind == KindActivation || in.Kind == KindRenewal):
		line, err := baseLine(in, in.Advance)
		if err != nil {
			return Composition{}, err
		}
		lines = appendLine(lines, line)
	case !baseInAdvance && (in.Kind == KindRenewal || in.Kind == KindFinal):
		line, err := baseLine(in, in.Arrears)
		if err != nil {
			return Composition{}, err
		}
		lines = appendLine(lines, line)
	}

	metered, err := MeteredLines(in)
	if err != nil {
		return Composition{}, err
	}
	return Assemble(append(lines, metered...))
}

// MeteredLines rates the metered prices of a RENEWAL or FINAL over its
// arrears period; an ACTIVATION has none.
func MeteredLines(in Input) ([]InvoiceLine, error) {
	if in.Kind != KindRenewal && in.Kind != KindFinal {
		return nil, nil
	}
	var lines []InvoiceLine
	for _, price := range in.Metered {
		line, ok, err := meteredLine(in, price)
		if err != nil {
			return nil, err
		}
		if ok {
			lines = appendLine(lines, line)
		}
	}
	return lines, nil
}

// Assemble orders lines by service start, type, the price's display order
// and its id, numbers them from 1, and totals them. A recompose assembles the
// lines it kept with the ones it measured again.
func Assemble(lines []InvoiceLine) (Composition, error) {
	sort.SliceStable(lines, func(i, j int) bool {
		a, b := lines[i], lines[j]
		if !a.ServiceFrom.Equal(b.ServiceFrom) {
			return a.ServiceFrom.Before(b.ServiceFrom)
		}
		if typeRank[a.Type] != typeRank[b.Type] {
			return typeRank[a.Type] < typeRank[b.Type]
		}
		if a.displayOrder != b.displayOrder {
			return a.displayOrder < b.displayOrder
		}
		return a.LicensePriceID.String() < b.LicensePriceID.String()
	})

	var subtotal int64
	for i := range lines {
		lines[i].Seq = i + 1
		if lines[i].Amount > math.MaxInt64-subtotal {
			return Composition{}, ErrAmountOverflow
		}
		subtotal += lines[i].Amount
	}
	return Composition{Lines: lines, Subtotal: subtotal, DiscountTotal: 0, Total: subtotal}, nil
}

// appendLine drops a line whose service period would be empty.
func appendLine(lines []InvoiceLine, line InvoiceLine) []InvoiceLine {
	if !line.ServiceFrom.Before(line.ServiceTo) {
		return lines
	}
	return append(lines, line)
}

func baseLine(in Input, service Period) (InvoiceLine, error) {
	quantity := decimal.NewFromInt(1)
	amount, err := lineAmount(quantity, in.Base.UnitAmountDecimal)
	if err != nil {
		return InvoiceLine{}, err
	}
	label := in.Base.DisplayLabel
	if label == "" {
		label = in.LicenseName + " — base"
	}
	price := in.Base.ID
	return InvoiceLine{
		ID:                nil,
		Seq:               0,
		Type:              LineBase,
		BillingModel:      in.Base.BillingModel,
		BillingTiming:     in.Base.BillingTiming,
		LicensePriceID:    &price,
		EntitlementID:     nil,
		EntitlementSlug:   nil,
		Label:             truncate(label),
		Description:       truncate(arithmetic(quantity, in.Base.UnitAmountDecimal, in.Currency, "")),
		ServiceFrom:       service.From,
		ServiceTo:         service.To,
		Quantity:          money.FormatDecimal(quantity),
		UnitAmountDecimal: money.FormatDecimal(in.Base.UnitAmountDecimal),
		Amount:            amount,
		Metering:          nil,
		Overage:           nil,
		Capped:            false,
		displayOrder:      in.Base.DisplayOrder,
	}, nil
}

// meteredLine rates one metered price over the arrears period. A price whose
// quantity is 0 produces no line; one whose quantity is positive does, even
// when its amount rounds to 0.
func meteredLine(in Input, price Price) (InvoiceLine, bool, error) {
	if price.Meter == nil || in.Arrears.empty() {
		return InvoiceLine{}, false, nil
	}
	measure := in.Measures[price.Meter.EntitlementID]
	lineType, measured := LineUsage, measure.Usage
	if price.BillingModel == ModelOverage {
		if measure.Unlimited {
			return InvoiceLine{}, false, nil
		}
		lineType, measured = LineOverage, measure.Overage
	}
	if !measured.IsPositive() {
		return InvoiceLine{}, false, nil
	}

	factor := price.Meter.SaleUnitFactor
	if !factor.IsPositive() {
		factor = decimal.NewFromInt(1)
	}
	quantity := money.Quantity(measured, factor)
	if !quantity.IsPositive() {
		return InvoiceLine{}, false, nil
	}
	amount, err := lineAmount(quantity, price.UnitAmountDecimal)
	if err != nil {
		return InvoiceLine{}, false, err
	}

	label := price.DisplayLabel
	if label == "" {
		label = price.Meter.EntitlementName
		if lineType == LineOverage {
			label += " — overage"
		}
	}
	description := arithmetic(quantity, price.UnitAmountDecimal, in.Currency, price.Meter.SaleUnit)
	var overage *InvoiceLineOverage
	if lineType == LineOverage {
		description += fmt.Sprintf("; %s used; %s above the applied limit%s",
			group(measure.Usage), group(measure.Overage), limitsText(measure.Limits))
		overage = &InvoiceLineOverage{
			UsageMeasured:   money.FormatDecimal(measure.Usage),
			OverageMeasured: money.FormatDecimal(measure.Overage),
			Limits:          limitsOrEmpty(measure.Limits),
		}
	}
	if measure.Capped {
		description += "; sample capped at what the licence accepts"
	}
	floored := measure.NegativeSegmentsFloored
	if lineType == LineOverage {
		floored = measure.OverageFloored
	}
	if floored > 0 {
		description += "; corrections below 0 not credited"
	}

	entitlementID, entitlementSlug := price.Meter.EntitlementID, price.Meter.EntitlementSlug
	return InvoiceLine{
		ID:                nil,
		Seq:               0,
		Type:              lineType,
		BillingModel:      price.BillingModel,
		BillingTiming:     price.BillingTiming,
		LicensePriceID:    &price.ID,
		EntitlementID:     &entitlementID,
		EntitlementSlug:   &entitlementSlug,
		Label:             truncate(label),
		Description:       truncate(description),
		ServiceFrom:       in.Arrears.From,
		ServiceTo:         in.Arrears.To,
		Quantity:          money.FormatDecimal(quantity),
		UnitAmountDecimal: money.FormatDecimal(price.UnitAmountDecimal),
		Amount:            amount,
		Metering: &InvoiceLineMetering{
			SaleUnitFactor:          money.FormatDecimal(factor),
			MeasuredQuantity:        money.FormatDecimal(measured),
			Windows:                 measure.Windows,
			NegativeSegmentsFloored: floored,
			Ledger:                  measure.Ledger,
		},
		Overage:      overage,
		Capped:       measure.Capped,
		displayOrder: price.DisplayOrder,
	}, true, nil
}

var maxAmount = decimal.NewFromInt(math.MaxInt64)

// lineAmount is round_half_up(quantity × unit), refused beyond int64.
func lineAmount(quantity, unit decimal.Decimal) (int64, error) {
	if quantity.Mul(unit).Round(0).GreaterThan(maxAmount) {
		return 0, ErrAmountOverflow
	}
	return money.Amount(quantity, unit), nil
}

// arithmetic is the line's "quantity × unit price" text, the unit price in
// major units: "3.05 × 8.00 EUR (per 10k tokens)".
func arithmetic(quantity, unit decimal.Decimal, currency money.Currency, saleUnit string) string {
	text := fmt.Sprintf("%s × %s %s", money.FormatDecimal(quantity), major(unit, currency), currency)
	if saleUnit != "" {
		text += " (per " + saleUnit + ")"
	}
	return text
}

// major writes a minor-unit amount in major units with at least the
// currency's decimals: 800 EUR cents is "8.00", 0.04 is "0.0004".
func major(minor decimal.Decimal, currency money.Currency) string {
	exponent := currency.Exponent()
	value := minor.Shift(-exponent)
	if value.Exponent() >= -exponent {
		return value.StringFixed(exponent)
	}
	return value.String()
}

// group writes a decimal with thousands separators: 130500 is "130,500".
func group(d decimal.Decimal) string {
	text := d.String()
	whole, fraction, hasFraction := strings.Cut(text, ".")
	negative := strings.HasPrefix(whole, "-")
	whole = strings.TrimPrefix(whole, "-")
	var b strings.Builder
	for i, digit := range whole {
		if i > 0 && (len(whole)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(digit)
	}
	out := b.String()
	if hasFraction {
		out += "." + fraction
	}
	if negative {
		out = "-" + out
	}
	return out
}

// limitsText is " (100,000)" or " (100,000 → 150,000)": the limits applied, in
// the order they first applied.
func limitsText(limits []OverageLimit) string {
	var values []string
	for _, limit := range limits {
		if limit.LimitValue == nil {
			values = append(values, "unlimited")
			continue
		}
		values = append(values, group(decimal.RequireFromString(*limit.LimitValue)))
	}
	if len(values) == 0 {
		return ""
	}
	return " (" + strings.Join(values, " → ") + ")"
}

func limitsOrEmpty(limits []OverageLimit) []OverageLimit {
	if limits == nil {
		return []OverageLimit{}
	}
	return limits
}

// truncate keeps a label or description within the 500 characters a line
// allows.
func truncate(s string) string {
	const limit = 500
	runes := []rune(s)
	if len(runes) <= limit {
		return s
	}
	return string(runes[:limit-1]) + "…"
}

// AddMonthsClamped is t moved by k months, the day clamped to the target
// month's last: 01-31 plus one month is 02-28 (02-29 in a leap year), never
// 03-03. A subscription's periods are counted from its anchor this way.
func AddMonthsClamped(t time.Time, k int) time.Time {
	year, month, day := t.Date()
	first := time.Date(year, month, 1, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location()).AddDate(0, k, 0)
	last := first.AddDate(0, 1, -1).Day()
	if day > last {
		day = last
	}
	return first.AddDate(0, 0, day-1)
}

// PeriodMonths is how many months a billing period spans; 0 for an unknown
// one.
func PeriodMonths(billingPeriod string) int {
	switch billingPeriod {
	case "MONTHLY":
		return 1
	case "QUARTERLY":
		return 3
	case "SEMI_ANNUAL":
		return 6
	case "ANNUAL":
		return 12
	default:
		return 0
	}
}
