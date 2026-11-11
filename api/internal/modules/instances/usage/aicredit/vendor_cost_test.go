package aicredit

import (
	"testing"

	"github.com/shopspring/decimal"
)

func TestVendorCost(t *testing.T) {
	d := func(value string) *decimal.Decimal {
		v := decimal.RequireFromString(value)
		return &v
	}
	n := func(value int64) *int64 { return &value }
	full := &Costs{Request: d("0.01"), InputToken: d("0.000003"), CachedInputToken: d("0.0000003"), CacheWriteToken: d("0.00000375"), OutputToken: d("0.000015"), Unit: d("0.04")}
	for _, tc := range []struct {
		name  string
		costs *Costs
		usage Usage
		want  string // "" is nil: no vendor cost
	}{
		{"unknown model", nil, Usage{InputTokens: n(1000)}, ""},
		{"model without any cost", &Costs{}, Usage{InputTokens: n(1000), OutputTokens: n(500)}, ""},
		{
			"every dimension", full,
			Usage{InputTokens: n(1000), CacheReadInputTokens: n(2000), CacheWriteInputTokens: n(400), OutputTokens: n(500), Units: d("2.5")},
			// 0.01 + 0.003 + 0.0006 + 0.0015 + 0.0075 + 0.1
			"0.1226",
		},
		{"tokens only", &Costs{InputToken: d("0.000003"), OutputToken: d("0.000015")}, Usage{InputTokens: n(1000), OutputTokens: n(500)}, "0.0105"},
		{
			"cache costs fall back to the input cost", &Costs{InputToken: d("0.000003")},
			Usage{InputTokens: n(100), CacheReadInputTokens: n(200), CacheWriteInputTokens: n(300)},
			"0.0018",
		},
		{
			"a cache cost of its own wins over the fallback", &Costs{InputToken: d("0.000003"), CachedInputToken: d("0"), CacheWriteToken: d("0.000006")},
			Usage{InputTokens: n(100), CacheReadInputTokens: n(200), CacheWriteInputTokens: n(300)},
			"0.0021",
		},
		{"no input cost, no cache fallback", &Costs{OutputToken: d("0.000015")}, Usage{CacheReadInputTokens: n(200), CacheWriteInputTokens: n(300), OutputTokens: n(10)}, "0.00015"},
		{"per-request cost with no usage at all", &Costs{Request: d("0.02")}, Usage{}, "0.02"},
		{"per-request cost is added once", &Costs{Request: d("0.02"), OutputToken: d("0.001")}, Usage{OutputTokens: n(3)}, "0.023"},
		{"per-unit cost", &Costs{Unit: d("0.04")}, Usage{Units: d("3")}, "0.12"},
		{"fractional units", &Costs{Unit: d("0.000000000001")}, Usage{Units: d("0.5")}, "0.000000000001"},
		{"a known cost and nothing to apply it to is zero, not unknown", &Costs{OutputToken: d("0.000015")}, Usage{InputTokens: n(1000)}, "0"},
		{"an explicit zero quantity", &Costs{OutputToken: d("0.000015")}, Usage{OutputTokens: n(0)}, "0"},
		{"a free model is known to cost nothing", &Costs{InputToken: d("0")}, Usage{InputTokens: n(1000)}, "0"},
		{"duration has no catalogue cost", full, Usage{DurationMS: n(60000)}, "0.01"},
		{"twelve decimals are kept", &Costs{InputToken: d("0.000000000001")}, Usage{InputTokens: n(7)}, "0.000000000007"},
		{"largest amount the record holds", &Costs{InputToken: d("0.000000000001")}, Usage{InputTokens: n(999999999999999999)}, "999999.999999999999"},
		{"beyond what the record holds", &Costs{InputToken: d("999999")}, Usage{InputTokens: n(9000000000000000000)}, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := VendorCost(tc.costs, tc.usage)
			if tc.want == "" {
				if got != nil {
					t.Fatalf("cost=%s, want none", got)
				}
				return
			}
			if got == nil || !got.Equal(decimal.RequireFromString(tc.want)) {
				t.Fatalf("cost=%v, want %s", got, tc.want)
			}
			if got.Exponent() < -vendorCostScale {
				t.Fatalf("cost=%s keeps more than %d decimals", got, vendorCostScale)
			}
		})
	}
}

func TestUsageReported(t *testing.T) {
	zero := int64(0)
	units := decimal.Zero
	if (Usage{}).Reported() {
		t.Fatal("no quantity is not a report")
	}
	for name, usage := range map[string]Usage{
		"input": {InputTokens: &zero}, "cache read": {CacheReadInputTokens: &zero}, "cache write": {CacheWriteInputTokens: &zero},
		"output": {OutputTokens: &zero}, "units": {Units: &units}, "duration": {DurationMS: &zero},
	} {
		if !usage.Reported() {
			t.Fatalf("%s: a reported zero is a report", name)
		}
	}
}
