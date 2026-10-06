package rating

import "github.com/shopspring/decimal"

// Window is one reset window's journal rows, summed: the counter's net
// movement, and its net movement above the limit each row was gated against.
type Window struct {
	Usage   decimal.Decimal
	Overage decimal.Decimal
}

// MeasureWindows is what a meter measured over a period from its journal:
// each window's movement floored at 0, then summed. A window that moved down
// -- a correction, or a downward set -- counts as 0 rather than as a credit.
// limits are the limits the rows were gated against, first-seen first; the
// meter is unlimited when it has rows and none of them had a limit.
func MeasureWindows(windows []Window, limits []OverageLimit, ledger *InvoiceLineLedger) Measure {
	measure := Measure{
		Usage:                   decimal.Zero,
		Overage:                 decimal.Zero,
		Windows:                 len(windows),
		NegativeSegmentsFloored: 0,
		OverageFloored:          0,
		Limits:                  limits,
		Ledger:                  ledger,
		Unlimited:               len(limits) > 0,
		Capped:                  false,
	}
	for _, w := range windows {
		if w.Usage.IsNegative() {
			measure.NegativeSegmentsFloored++
		} else {
			measure.Usage = measure.Usage.Add(w.Usage)
		}
		if w.Overage.IsNegative() {
			measure.OverageFloored++
		} else {
			measure.Overage = measure.Overage.Add(w.Overage)
		}
	}
	for _, limit := range limits {
		if limit.LimitValue != nil {
			measure.Unlimited = false
		}
	}
	return measure
}
