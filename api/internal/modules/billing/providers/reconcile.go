package providers

import (
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/invoices"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/rating"
)

// Reconciliation is an invoice compared with its provider's copy.
type Reconciliation struct {
	Matched bool
	// Detail says what differs; nil when matched.
	Detail *invoices.Reconciliation
	// Lines are the invoice's lines with the provider's ids and amounts.
	Lines []rating.InvoiceLine
}

// DueDateTolerance is how far the provider's due date may be from Kaiten's.
// Kaiten sets it just before finalizing, a minute ahead for the
// finalization's own delay, and counts its own from the finalization
// instant: the two are seconds apart. A due date the provider counted from
// the draft's creation (a draft finalized in its dashboard after a review)
// is as far off as the draft waited.
const DueDateTolerance = time.Hour

// Reconcile compares an invoice with its provider's copy, once, right after
// finalization. Tolerance is 0 (CR-001 §5):
//   - the provider's lines that belong to the invoice match Kaiten's lines
//     other than DISCOUNT ones, one to one, by Kaiten line id, each with the
//     same gross amount and currency;
//   - on each target line, the discount of each allocation of a DISCOUNT
//     line takes off its amount; any other discount on a line (a coupon
//     added in the provider) is extra;
//   - the provider's total excluding tax (after discounts) equals Kaiten's
//     total, or, when the provider's tax is included in the amounts, its
//     subtotal (already net of the item discounts) does;
//   - when dueAt is given (a SEND_INVOICE invoice), the provider's due date
//     is within DueDateTolerance of it (§12.4 rule 4).
//
// Kaiten never corrects itself from the provider: a mismatch is reported, and
// remedied by a void and a recompose.
func Reconcile(lines []rating.InvoiceLine, totalMinor int64, currency string, read provider.Invoice, inclusiveTax bool, dueAt *time.Time) Reconciliation {
	byLine := map[uuid.UUID]provider.Line{}
	var extra []string
	for _, line := range read.Lines {
		if line.KaitenLineID == uuid.Nil {
			extra = append(extra, line.ExternalLineID)
			continue
		}
		byLine[line.KaitenLineID] = line
	}

	detail := invoices.Reconciliation{
		Lines: []invoices.LineDifference{}, MissingInProvider: []uuid.UUID{}, ExtraInProvider: []string{},
		Discounts: []invoices.DiscountDifference{}, ExtraDiscounts: []invoices.ExtraDiscount{},
		Totals: invoices.TotalsDifference{
			KaitenTotal: totalMinor, ProviderTotalExcludingTax: read.TotalExcludingTax, ProviderSubtotal: nil,
			ProviderTotalDiscount: nil,
		},
		InclusiveTax: inclusiveTax,
	}
	matched := true
	out := make([]rating.InvoiceLine, len(lines))
	seen := map[uuid.UUID]bool{}
	seqs := map[int]uuid.UUID{}
	for i, line := range lines {
		out[i] = line
		if line.ID == nil || line.Type == rating.LineDiscount {
			continue
		}
		seqs[line.Seq] = *line.ID
		providerLine, ok := byLine[*line.ID]
		if !ok {
			matched = false
			detail.MissingInProvider = append(detail.MissingInProvider, *line.ID)
			continue
		}
		seen[*line.ID] = true
		amount := providerLine.AmountMinor
		out[i].Provider = &rating.InvoiceLineProvider{ExternalLineID: providerLine.ExternalLineID, Amount: &amount, CouponIDs: nil}
		if providerLine.AmountMinor != line.Amount || (providerLine.Currency != "" && providerLine.Currency != currency) {
			matched = false
			detail.Lines = append(detail.Lines, invoices.LineDifference{
				LineID: *line.ID, Seq: line.Seq, KaitenAmount: line.Amount, ProviderAmount: providerLine.AmountMinor,
				ExternalLineID: providerLine.ExternalLineID,
			})
		}
	}
	for id, line := range byLine {
		if !seen[id] {
			extra = append(extra, line.ExternalLineID)
		}
	}
	if len(extra) > 0 {
		matched = false
		detail.ExtraInProvider = extra
	}

	// What each target line's discounts should take off it, by coupon.
	type key struct {
		line   uuid.UUID
		coupon string
	}
	expected := map[key]bool{}
	for _, line := range lines {
		if line.Type != rating.LineDiscount || line.ID == nil || line.Discount == nil {
			continue
		}
		for i, a := range line.Discount.Allocations {
			coupon := ""
			if line.Provider != nil && i < len(line.Provider.CouponIDs) {
				coupon = line.Provider.CouponIDs[i]
			}
			target, ok := seqs[a.TargetSeq]
			var applied *int64
			if providerLine, found := byLine[target]; ok && found && coupon != "" {
				for _, d := range providerLine.Discounts {
					if d.ExternalID == coupon {
						amount := d.AmountMinor
						applied = &amount
					}
				}
			}
			expected[key{line: target, coupon: coupon}] = true
			if applied == nil || *applied != a.Amount {
				matched = false
				var got int64
				if applied != nil {
					got = *applied
				}
				detail.Discounts = append(detail.Discounts, invoices.DiscountDifference{
					LineID: *line.ID, Seq: line.Seq, TargetSeq: a.TargetSeq, KaitenAmount: a.Amount, ProviderAmount: got, CouponID: coupon,
				})
			}
		}
	}
	for _, providerLine := range read.Lines {
		for _, d := range providerLine.Discounts {
			if !expected[key{line: providerLine.KaitenLineID, coupon: d.ExternalID}] {
				matched = false
				detail.ExtraDiscounts = append(detail.ExtraDiscounts, invoices.ExtraDiscount{
					ExternalLineID: providerLine.ExternalLineID, DiscountID: d.ExternalID, Amount: d.AmountMinor,
				})
			}
		}
	}

	compared := read.TotalExcludingTax
	if inclusiveTax {
		// Stripe's subtotal already has the item-level discounts taken off,
		// and every discount Kaiten sends is on an item (CR-001): it is the
		// tax-inclusive amount Kaiten's total is (CR-001 §7.6, measured
		// against Stripe test mode).
		subtotal, discount := read.Subtotal, read.TotalDiscount
		detail.Totals.ProviderSubtotal, detail.Totals.ProviderTotalDiscount = &subtotal, &discount
		compared = subtotal
	}
	if compared != totalMinor {
		matched = false
	}
	if dueAt != nil && read.DueAt != nil {
		if drift := read.DueAt.Sub(*dueAt); drift <= -DueDateTolerance || drift >= DueDateTolerance {
			matched = false
			detail.DueDate = &invoices.DueDateDifference{KaitenDueAt: dueAt.UTC(), ProviderDueAt: read.DueAt.UTC()}
		}
	}
	if matched {
		return Reconciliation{Matched: true, Detail: nil, Lines: out}
	}
	return Reconciliation{Matched: false, Detail: &detail, Lines: out}
}
