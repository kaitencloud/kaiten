package aicredit

import "github.com/shopspring/decimal"

// Costs are a model's catalogue costs, in the catalogue's cost currency. Nil
// is absent, not free. The catalogue holds no per-second cost: a duration
// has no vendor cost yet.
type Costs struct {
	Request          *decimal.Decimal
	InputToken       *decimal.Decimal
	CachedInputToken *decimal.Decimal
	CacheWriteToken  *decimal.Decimal
	OutputToken      *decimal.Decimal
	Unit             *decimal.Decimal
}

// vendorCostScale and vendorCostLimit are what the record can hold:
// NUMERIC(24, 12), twelve decimals below 10^12.
const vendorCostScale = 12

var vendorCostLimit = decimal.New(1, 12)

// Reported tells whether the caller sent any quantity at all, a zero included.
func (u Usage) Reported() bool {
	return u.InputTokens != nil || u.CacheReadInputTokens != nil || u.CacheWriteInputTokens != nil ||
		u.OutputTokens != nil || u.Units != nil || u.DurationMS != nil
}

// VendorCost is what the provider request cost by the catalogue: each
// reported quantity at its cost, plus the per-request cost once. It is
// evidence beside the charge and never changes it.
//
// An absent cost counts nothing, except the two cache costs, which fall back
// to the input cost as the cache rates of a conversion rule do. An absent
// quantity counts nothing either. The result is nil, not zero, when there is
// nothing to compute from -- costs is nil (the model is not in the
// catalogue) or carries no cost at all -- and when the amount is beyond what
// the record can hold: an unknown cost must not read as a free request, and
// an absurd one must not fail the commit that reports it.
func VendorCost(costs *Costs, usage Usage) *decimal.Decimal {
	if costs == nil {
		return nil
	}
	known := false
	for _, cost := range []*decimal.Decimal{costs.Request, costs.InputToken, costs.CachedInputToken, costs.CacheWriteToken, costs.OutputToken, costs.Unit} {
		known = known || cost != nil
	}
	if !known {
		return nil
	}
	total := decimal.Zero
	add := func(cost, quantity *decimal.Decimal) {
		if cost != nil && quantity != nil {
			total = total.Add(cost.Mul(*quantity))
		}
	}
	integer := func(value *int64) *decimal.Decimal {
		if value == nil {
			return nil
		}
		quantity := decimal.NewFromInt(*value)
		return &quantity
	}
	cacheRead, cacheWrite := costs.CachedInputToken, costs.CacheWriteToken
	if cacheRead == nil {
		cacheRead = costs.InputToken
	}
	if cacheWrite == nil {
		cacheWrite = costs.InputToken
	}
	one := decimal.NewFromInt(1)
	add(costs.Request, &one)
	add(costs.InputToken, integer(usage.InputTokens))
	add(cacheRead, integer(usage.CacheReadInputTokens))
	add(cacheWrite, integer(usage.CacheWriteInputTokens))
	add(costs.OutputToken, integer(usage.OutputTokens))
	add(costs.Unit, usage.Units)
	total = total.Round(vendorCostScale)
	if total.IsNegative() || total.GreaterThanOrEqual(vendorCostLimit) {
		return nil
	}
	return &total
}
