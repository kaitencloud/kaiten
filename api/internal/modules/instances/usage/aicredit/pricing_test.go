package aicredit

import (
	"testing"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

func amount(s string) *decimal.Decimal { d := decimal.RequireFromString(s); return &d }
func quantity(n int64) *int64          { return &n }

func TestResolve(t *testing.T) {
	id, other := uuid.New(), uuid.New()
	request := Completion
	rules := []Rule{
		{ID: uuid.New(), Active: true},
		{ID: uuid.New(), Active: true, RequestType: &request},
		{ID: uuid.New(), Active: true, ModelID: &id},
		{ID: uuid.New(), Active: true, ModelID: &id, RequestType: &request},
	}
	for _, tc := range []struct {
		name  string
		rules []Rule
		model *Model
		want  Specificity
	}{
		{"exact typed", rules, &Model{ID: id, Status: Active}, ExactTyped},
		{"exact all", rules[:3], &Model{ID: id, Status: Active}, ExactAll},
		{"any typed", rules[:2], &Model{ID: id, Status: Active}, AnyTyped},
		{"any all", rules[:1], &Model{ID: id, Status: Active}, AnyAll},
		{"future model wildcard", rules, &Model{ID: other, Status: Active}, AnyTyped},
		{"deprecated still priced", rules, &Model{ID: id, Status: Deprecated}, ExactTyped},
		{"archived never priced", rules, &Model{ID: id, Status: Archived}, ""},
		{"unknown never priced", rules, nil, ""},
		{"inactive ignored", []Rule{{ModelID: &id}}, &Model{ID: id, Status: Active}, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, specificity := Resolve(tc.rules, tc.model, Completion)
			if specificity != tc.want || (got == nil) != (tc.want == "") {
				t.Fatalf("Resolve = %v, %s; want %s", got, specificity, tc.want)
			}
		})
	}
}

func TestPriceVector(t *testing.T) {
	for _, tc := range []struct {
		name                      string
		rates                     Rates
		usage                     Usage
		min                       string
		max                       *decimal.Decimal
		wantComputed, wantCharged string
		missing                   bool
	}{
		{"per request", Rates{Request: amount("1.2")}, Usage{}, "0", nil, "1.2", "1.2", false},
		{"input cache fallback", Rates{InputToken: amount("0.01")}, Usage{InputTokens: quantity(10), CacheReadInputTokens: quantity(20), CacheWriteInputTokens: quantity(30)}, "0", nil, "0.6", "0.6", false},
		{"cache overrides", Rates{InputToken: amount("1"), CachedInputToken: amount("0.1"), CacheWriteToken: amount("2")}, Usage{InputTokens: quantity(1), CacheReadInputTokens: quantity(2), CacheWriteInputTokens: quantity(3)}, "0", nil, "7.2", "7.2", false},
		{"output", Rates{OutputToken: amount("0.2")}, Usage{OutputTokens: quantity(5)}, "0", nil, "1", "1", false},
		{"unit", Rates{Unit: amount("2")}, Usage{Units: amount("1.5")}, "0", nil, "3", "3", false},
		{"seconds exact", Rates{Second: amount("0.7")}, Usage{DurationMS: quantity(1500)}, "0", nil, "1.05", "1.05", false},
		{"composite", Rates{Request: amount("1"), InputToken: amount("0.01"), OutputToken: amount("0.1")}, Usage{InputTokens: quantity(10), OutputTokens: quantity(5)}, "0", nil, "1.6", "1.6", false},
		{"minimum missing", Rates{OutputToken: amount("1")}, Usage{}, "2", nil, "2", "2", true},
		{"present zero", Rates{OutputToken: amount("1")}, Usage{OutputTokens: quantity(0)}, "2", nil, "0", "2", false},
		{"maximum", Rates{Request: amount("10")}, Usage{}, "2", amount("5"), "10", "5", false},
		{"half up", Rates{InputToken: amount("0.0000005")}, Usage{InputTokens: quantity(1)}, "0", nil, "0.000001", "0.000001", false},
		{"below quantum", Rates{InputToken: amount("0.0000004")}, Usage{InputTokens: quantity(1)}, "0", nil, "0", "0", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			rule := Rule{Rates: tc.rates, Minimum: *amount(tc.min), Maximum: tc.max, ChargeOnError: Never}
			got, err := Price(rule, tc.usage, Success)
			if err != nil {
				t.Fatal(err)
			}
			if got.Computed.String() != tc.wantComputed || got.Charged.String() != tc.wantCharged || got.MissingInput != tc.missing {
				t.Fatalf("Price = %+v; want %s/%s missing=%v", got, tc.wantComputed, tc.wantCharged, tc.missing)
			}
		})
	}
}

func TestPricePolicy(t *testing.T) {
	for _, policy := range []ChargeOnError{Never, Always, ProviderErrorOnly} {
		for _, status := range []RequestStatus{Success, ProviderError, CustomerError, NotSent} {
			t.Run(string(policy)+"/"+string(status), func(t *testing.T) {
				rule := Rule{Rates: Rates{Request: amount("1")}, Minimum: *amount("2"), ChargeOnError: policy}
				got, err := Price(rule, Usage{}, status)
				if err != nil {
					t.Fatal(err)
				}
				want := "0"
				if status == Success || (status == ProviderError && policy != Never) || (status == CustomerError && policy == Always) {
					want = "2"
				}
				if got.Charged.String() != want {
					t.Fatalf("charged %s, want %s", got.Charged, want)
				}
			})
		}
	}
}

func TestPriceRejectsMalformedInput(t *testing.T) {
	for _, tc := range []struct {
		name   string
		rule   Rule
		usage  Usage
		status RequestStatus
	}{
		{"no rates", Rule{ChargeOnError: Never}, Usage{}, Success},
		{"negative rate", Rule{Rates: Rates{Request: amount("-1")}, ChargeOnError: Never}, Usage{}, Success},
		{"rate precision", Rule{Rates: Rates{Request: amount("0.00000000001")}, ChargeOnError: Never}, Usage{}, Success},
		{"inverted bounds", Rule{Rates: Rates{Request: amount("1")}, Minimum: *amount("2"), Maximum: amount("1"), ChargeOnError: Never}, Usage{}, Success},
		{"negative tokens", Rule{Rates: Rates{Request: amount("1")}, ChargeOnError: Never}, Usage{InputTokens: quantity(-1)}, Success},
		{"negative units", Rule{Rates: Rates{Request: amount("1")}, ChargeOnError: Never}, Usage{Units: amount("-1")}, Success},
		{"unknown status", Rule{Rates: Rates{Request: amount("1")}, ChargeOnError: Never}, Usage{}, "unknown"},
		{"unknown policy", Rule{Rates: Rates{Request: amount("1")}}, Usage{}, Success},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := Price(tc.rule, tc.usage, tc.status); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}
