package getpubliccatalog

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSelfServe(t *testing.T) {
	defaultMonthly := PublicPrice{BillingModel: "FLAT_FEE", IsDefault: true}
	otherMonthly := PublicPrice{BillingModel: "FLAT_FEE", IsDefault: false}
	overage := PublicPrice{BillingModel: "OVERAGE", IsDefault: false}

	for _, tc := range []struct {
		name     string
		plan     PublicPlan
		captures bool
		want     bool
	}{
		{"PAID with a default flat fee, sold through a capturing provider", PublicPlan{PricingType: "PAID", Prices: []PublicPrice{defaultMonthly}}, true, true},
		{"PAID without a capturing provider", PublicPlan{PricingType: "PAID", Prices: []PublicPrice{defaultMonthly}}, false, false},
		{"FREE needs no provider", PublicPlan{PricingType: "FREE", Prices: []PublicPrice{defaultMonthly}}, false, true},
		{"CUSTOM never", PublicPlan{PricingType: "CUSTOM", Prices: []PublicPrice{defaultMonthly}}, true, false},
		{"no default flat fee", PublicPlan{PricingType: "PAID", Prices: []PublicPrice{otherMonthly, overage}}, true, false},
		{"no prices at all", PublicPlan{PricingType: "FREE", Prices: []PublicPrice{}}, true, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, selfServe(tc.plan, tc.captures))
		})
	}
}
