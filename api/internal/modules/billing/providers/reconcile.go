package providers

import (
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

// Reconcile compares an invoice with its provider's copy, once, right after
// finalization. Tolerance is 0:
//   - the provider's lines that belong to the invoice match Kaiten's one to
//     one, by Kaiten line id, each with the same amount and currency;
//   - the provider's total excluding tax equals Kaiten's total, or, when the
//     provider's tax is included in the amounts, its subtotal does.
//
// Kaiten never corrects itself from the provider: a mismatch is reported, and
// remedied by a void and a recompose.
func Reconcile(lines []rating.InvoiceLine, totalMinor int64, currency string, read provider.Invoice, inclusiveTax bool) Reconciliation {
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
		Totals: invoices.TotalsDifference{
			KaitenTotal: totalMinor, ProviderTotalExcludingTax: read.TotalExcludingTax, ProviderSubtotal: nil,
		},
		InclusiveTax: inclusiveTax,
	}
	matched := true
	out := make([]rating.InvoiceLine, len(lines))
	seen := map[uuid.UUID]bool{}
	for i, line := range lines {
		out[i] = line
		if line.ID == nil {
			continue
		}
		providerLine, ok := byLine[*line.ID]
		if !ok {
			matched = false
			detail.MissingInProvider = append(detail.MissingInProvider, *line.ID)
			continue
		}
		seen[*line.ID] = true
		amount := providerLine.AmountMinor
		out[i].Provider = &rating.InvoiceLineProvider{ExternalLineID: providerLine.ExternalLineID, Amount: &amount}
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

	compared := read.TotalExcludingTax
	if inclusiveTax {
		subtotal := read.Subtotal
		detail.Totals.ProviderSubtotal = &subtotal
		compared = subtotal
	}
	if compared != totalMinor {
		matched = false
	}
	if matched {
		return Reconciliation{Matched: true, Detail: nil, Lines: out}
	}
	return Reconciliation{Matched: false, Detail: &detail, Lines: out}
}
