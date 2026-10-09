package rating

import (
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
)

// Discount types and scopes, as vouchers spell them.
const (
	DiscountPercentage = "PERCENTAGE"
	DiscountFixed      = "FIXED_AMOUNT"

	AppliesLicenseBase = "LICENSE_BASE"
	AppliesAddons      = "ADDONS"
	AppliesBoth        = "BOTH"
	AppliesSelected    = "SELECTED_PRICES"
)

// Discount is a PRICE voucher redemption that may apply to an invoice.
type Discount struct {
	InstanceVoucherID uuid.UUID
	VoucherID         uuid.UUID
	Name              string
	Type              string
	Value             decimal.Decimal
	// Currency is a FIXED_AMOUNT's; "" for a percentage.
	Currency        string
	AppliesTo       string
	LicensePriceIDs []uuid.UUID
	AddonPriceIDs   []uuid.UUID
	// Applications is how many invoices it already discounted;
	// ApplicationsMax its limit, nil for FOREVER.
	Applications    int32
	ApplicationsMax *int32
}

// InvoiceLineDiscount is how a DISCOUNT line was computed.
type InvoiceLineDiscount struct {
	DiscountType    string               `json:"discountType" enum:"PERCENTAGE,FIXED_AMOUNT"`
	DiscountValue   string               `json:"discountValue" doc:"The percentage, or the amount in minor units"`
	Currency        *string              `json:"currency,omitempty"`
	AppliesTo       string               `json:"appliesTo" enum:"LICENSE_BASE,ADDONS,BOTH,SELECTED_PRICES"`
	TargetSeqs      []int                `json:"targetSeqs" doc:"The lines it discounts"`
	Base            string               `json:"base" doc:"What its targets still amounted to before it, exact, in minor units"`
	Application     int32                `json:"application" doc:"Which invoice of the redemption this is, from 1"`
	ApplicationsMax *int32               `json:"applicationsMax,omitempty" doc:"How many invoices the redemption discounts; absent for FOREVER"`
	Allocations     []DiscountAllocation `json:"allocations" nullable:"false" readOnly:"true" doc:"The part of the line each target bears, by ascending targetSeq: they sum to the line's magnitude, and no target is discounted below 0. A payment provider applies each one to its target line"`
}

// DiscountAllocation is the part of a DISCOUNT line one target line bears.
type DiscountAllocation struct {
	TargetSeq int   `json:"targetSeq" doc:"The target line"`
	Amount    int64 `json:"amount" doc:"In minor units, positive"`
}

// ApplyDiscounts adds a DISCOUNT line per applicable discount to an assembled
// composition, after its other lines:
//   - a discount past its applications, a fixed amount in another currency,
//     and one whose targets total 0 are skipped;
//   - percentages apply first, then fixed amounts, each in the order given
//     (the redemption order), on what their targets still amount to, so two
//     50 % discounts give 75 %;
//   - each line is the negation of the rounded magnitude, split across its
//     targets (allocate);
//   - if rounding would take the total below 0, the last lines are reduced
//     until it is 0 exactly, each taking the cut from its highest targets
//     first; a line reduced to 0 is dropped.
func ApplyDiscounts(comp Composition, discounts []Discount, currency money.Currency) (Composition, error) {
	if len(discounts) == 0 {
		return comp, nil
	}
	remaining := map[int]decimal.Decimal{}
	// capacity is what each target can still be discounted, in whole minor
	// units: no line is ever discounted below 0 (L-7).
	capacity := map[int]int64{}
	for _, line := range comp.Lines {
		if line.Type != LineDiscount {
			remaining[line.Seq] = decimal.NewFromInt(line.Amount)
			capacity[line.Seq] = max(line.Amount, 0)
		}
	}
	ordered := make([]Discount, 0, len(discounts))
	for _, kind := range []string{DiscountPercentage, DiscountFixed} {
		for _, d := range discounts {
			if d.Type == kind {
				ordered = append(ordered, d)
			}
		}
	}

	var lines []InvoiceLine
	for _, d := range ordered {
		if d.ApplicationsMax != nil && d.Applications >= *d.ApplicationsMax {
			continue
		}
		if d.Type == DiscountFixed && d.Currency != string(currency) {
			comp.CurrencySkipped++
			continue
		}
		targets := d.targets(comp.Lines)
		var total int64
		base := decimal.Zero
		for _, line := range targets {
			total += line.Amount
			base = base.Add(remaining[line.Seq])
		}
		if len(targets) == 0 || total == 0 {
			continue
		}
		// The exact reduction of each target, in seq order.
		reductions := make([]decimal.Decimal, len(targets))
		var raw decimal.Decimal
		if d.Type == DiscountPercentage {
			share := d.Value.Div(decimal.NewFromInt(100))
			raw = base.Mul(share)
			for i, line := range targets {
				reductions[i] = remaining[line.Seq].Mul(share)
				remaining[line.Seq] = remaining[line.Seq].Sub(reductions[i])
			}
		} else {
			raw = decimal.Min(d.Value, base)
			left := raw
			for i, line := range targets {
				reductions[i] = decimal.Min(left, remaining[line.Seq])
				remaining[line.Seq] = remaining[line.Seq].Sub(reductions[i])
				left = left.Sub(reductions[i])
			}
		}
		line := discountLine(d, targets, base, raw, currency)
		allocations := allocate(targets, reductions, -line.Amount, capacity)
		var allocated int64
		for _, a := range allocations {
			allocated += a.Amount
			capacity[a.TargetSeq] -= a.Amount
		}
		line.Amount = -allocated
		line.Discount.Allocations = allocations
		lines = append(lines, line)
	}

	// The floor: the discounts never take the total below 0.
	var discounted int64
	for _, line := range lines {
		discounted -= line.Amount
	}
	for i := len(lines) - 1; i >= 0 && discounted > comp.Subtotal; i-- {
		excess := discounted - comp.Subtotal
		magnitude := -lines[i].Amount
		cut := min(excess, magnitude)
		lines[i].Amount += cut
		lines[i].Discount.Allocations = trim(lines[i].Discount.Allocations, cut)
		discounted -= cut
	}
	lines = slices.DeleteFunc(lines, func(l InvoiceLine) bool { return l.Amount == 0 })

	next := len(comp.Lines)
	var discountTotal int64
	for i := range lines {
		next++
		lines[i].Seq = next
		discountTotal -= lines[i].Amount
	}
	comp.Lines = append(comp.Lines, lines...)
	comp.DiscountTotal = discountTotal
	comp.Total = comp.Subtotal - discountTotal
	return comp, nil
}

// allocate splits a DISCOUNT line's rounded magnitude across its targets by
// largest remainder (CR-001 §3.2): each target gets the floor of its exact
// reduction, then the units left go one each to the largest fractional parts,
// ties to the lower seq. No target gets more than its capacity; a unit no
// target can take is not allocated, and the line is that much smaller. That
// happens only when rounding several discounts on one small line would
// otherwise discount it below 0. Allocations of 0 are left out.
func allocate(targets []InvoiceLine, reductions []decimal.Decimal, magnitude int64, capacity map[int]int64) []DiscountAllocation {
	amounts := make([]int64, len(targets))
	order := make([]int, len(targets))
	left := magnitude
	for i, line := range targets {
		amounts[i] = min(reductions[i].Floor().IntPart(), capacity[line.Seq])
		left -= amounts[i]
		order[i] = i
	}
	slices.SortStableFunc(order, func(a, b int) int {
		fa := reductions[a].Sub(reductions[a].Floor())
		fb := reductions[b].Sub(reductions[b].Floor())
		if c := fb.Cmp(fa); c != 0 {
			return c
		}
		return targets[a].Seq - targets[b].Seq
	})
	// One unit each to the targets with a fractional part.
	for _, i := range order {
		if left == 0 {
			break
		}
		if !reductions[i].Equal(reductions[i].Floor()) && amounts[i] < capacity[targets[i].Seq] {
			amounts[i]++
			left--
		}
	}
	// Units a cap took away go to whichever target still has room.
	for progress := true; left > 0 && progress; {
		progress = false
		for _, i := range order {
			if left > 0 && amounts[i] < capacity[targets[i].Seq] {
				amounts[i]++
				left--
				progress = true
			}
		}
	}
	out := []DiscountAllocation{}
	for i, line := range targets {
		if amounts[i] > 0 {
			out = append(out, DiscountAllocation{TargetSeq: line.Seq, Amount: amounts[i]})
		}
	}
	return out
}

// trim takes cut off allocations, from the highest target first, dropping
// those that reach 0 (the floor rule, CR-001 §3.2 step 3).
func trim(allocations []DiscountAllocation, cut int64) []DiscountAllocation {
	out := slices.Clone(allocations)
	for i := len(out) - 1; i >= 0 && cut > 0; i-- {
		take := min(cut, out[i].Amount)
		out[i].Amount -= take
		cut -= take
	}
	return slices.DeleteFunc(out, func(a DiscountAllocation) bool { return a.Amount == 0 })
}

// targets are the non-DISCOUNT lines a discount applies to, in seq order.
func (d Discount) targets(lines []InvoiceLine) []InvoiceLine {
	var out []InvoiceLine
	for _, line := range lines {
		if line.Type == LineDiscount {
			continue
		}
		base := line.Type == LineBase
		addon := line.AddonPriceID != nil
		match := false
		switch d.AppliesTo {
		case AppliesLicenseBase:
			match = base
		case AppliesAddons:
			match = addon
		case AppliesBoth:
			match = base || addon
		case AppliesSelected:
			match = (line.LicensePriceID != nil && slices.Contains(d.LicensePriceIDs, *line.LicensePriceID)) ||
				(line.AddonPriceID != nil && slices.Contains(d.AddonPriceIDs, *line.AddonPriceID))
		}
		if match {
			out = append(out, line)
		}
	}
	slices.SortStableFunc(out, func(a, b InvoiceLine) int { return a.Seq - b.Seq })
	return out
}

func discountLine(d Discount, targets []InvoiceLine, base, raw decimal.Decimal, currency money.Currency) InvoiceLine {
	seqs := make([]int, len(targets))
	from, to := targets[0].ServiceFrom, targets[0].ServiceTo
	for i, line := range targets {
		seqs[i] = line.Seq
		from = earliest(from, line.ServiceFrom)
		to = latest(to, line.ServiceTo)
	}
	var fixedCurrency *string
	label := d.Name + " −" + d.Value.String() + "%"
	if d.Type == DiscountFixed {
		c := d.Currency
		fixedCurrency = &c
		label = d.Name + " −" + major(d.Value, currency) + " " + string(currency)
	}
	voucher, redemption := d.VoucherID, d.InstanceVoucherID
	return InvoiceLine{
		ID: nil, Seq: 0, Type: LineDiscount, BillingModel: "", BillingTiming: "",
		LicensePriceID: nil, AddonPriceID: nil, AddonID: nil, InstanceAddonID: nil,
		VoucherID: &voucher, InstanceVoucherID: &redemption,
		EntitlementID: nil, EntitlementSlug: nil,
		Label: truncate(label), Description: truncate("on " + major(base, currency) + " " + string(currency)),
		ServiceFrom: from, ServiceTo: to, Quantity: "1", UnitAmountDecimal: "",
		Amount:   -money.RoundMinor(raw),
		Metering: nil, Overage: nil, Capped: false, Provider: nil,
		Discount: &InvoiceLineDiscount{
			DiscountType: d.Type, DiscountValue: d.Value.String(), Currency: fixedCurrency, AppliesTo: d.AppliesTo,
			TargetSeqs: seqs, Base: money.FormatDecimal(base), Application: d.Applications + 1,
			ApplicationsMax: d.ApplicationsMax,
		},
		displayOrder: 0,
	}
}

func earliest(a, b time.Time) time.Time {
	if b.Before(a) {
		return b
	}
	return a
}

func latest(a, b time.Time) time.Time {
	if b.After(a) {
		return b
	}
	return a
}
