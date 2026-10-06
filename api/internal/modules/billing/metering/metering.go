// Package metering turns what the usage journal says about a meter into what
// the rating composer rates.
package metering

import (
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
		FirstSeq:   fp.FirstSeq,
		LastSeq:    fp.LastSeq,
		Rows:       fp.Rows,
		SumDelta:   money.FormatDecimal(fp.SumDelta),
		SumOverage: &sumOverage,
	}
}
