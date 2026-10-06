package rating

import (
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
)

// Grant is a licence's grant of a metered entitlement: its limit and the
// percent of it accepted above.
type Grant struct {
	Limit decimal.Decimal
	// Unlimited is a grant without a limit (value -1), or no grant at all.
	Unlimited      bool
	OveragePercent int32
}

var hundred = decimal.NewFromInt(100)

// Sample measures a sample quantity as one window against a constant grant,
// the way a licence preview rates sampleUsage. Usage above what the grant
// accepts -- limit × (1 + percent/100) -- would be rejected and never
// journalled, so it is capped and the measure says so:
//
//	usage   = min(quantity, limit × (1 + percent/100))
//	overage = min(max(0, quantity − limit), limit × percent/100)
//
// An unlimited grant caps nothing and has no overage.
func Sample(quantity decimal.Decimal, grant Grant) Measure {
	if grant.Unlimited {
		return Measure{
			Usage:                   quantity,
			Overage:                 decimal.Zero,
			Windows:                 1,
			NegativeSegmentsFloored: 0,
			Limits:                  []OverageLimit{{LimitValue: nil, OveragePercent: -1, Rows: 0}},
			Unlimited:               true,
			Capped:                  false,
		}
	}
	percent := max(grant.OveragePercent, 0)
	allowance := grant.Limit.Mul(decimal.NewFromInt32(percent)).Div(hundred)
	accepted := grant.Limit.Add(allowance)
	limit := money.FormatDecimal(grant.Limit)
	return Measure{
		Usage:                   decimal.Min(quantity, accepted),
		Overage:                 decimal.Min(decimal.Max(decimal.Zero, quantity.Sub(grant.Limit)), allowance),
		Windows:                 1,
		NegativeSegmentsFloored: 0,
		Limits:                  []OverageLimit{{LimitValue: &limit, OveragePercent: percent, Rows: 0}},
		Unlimited:               false,
		Capped:                  quantity.GreaterThan(accepted),
	}
}
