package rating

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"
)

var (
	boundary = time.Date(2027, 2, 15, 0, 0, 0, 0, time.UTC)
	elapsed  = Period{From: time.Date(2027, 1, 15, 0, 0, 0, 0, time.UTC), To: boundary}
	next     = Period{From: boundary, To: time.Date(2027, 3, 15, 0, 0, 0, 0, time.UTC)}

	tokensID   = uuid.MustParse("00000000-0000-0000-0000-0000000000a1")
	callsID    = uuid.MustParse("00000000-0000-0000-0000-0000000000a2")
	basePrice  = uuid.MustParse("00000000-0000-0000-0000-0000000000b1")
	tokenPrice = uuid.MustParse("00000000-0000-0000-0000-0000000000b2")
	callPrice  = uuid.MustParse("00000000-0000-0000-0000-0000000000b3")
)

func dec(s string) decimal.Decimal { return decimal.RequireFromString(s) }

func base(timing string) Price {
	return Price{ID: basePrice, BillingModel: ModelFlatFee, BillingTiming: timing, UnitAmountDecimal: dec("2900"), DisplayLabel: "", DisplayOrder: 0, Meter: nil}
}

func tokensOverage() Price {
	return Price{
		ID: tokenPrice, BillingModel: ModelOverage, BillingTiming: TimingArrears, UnitAmountDecimal: dec("800"), DisplayLabel: "", DisplayOrder: 0,
		Meter: &Meter{EntitlementID: tokensID, EntitlementSlug: "tokens", EntitlementName: "Tokens", SaleUnitFactor: dec("10000"), SaleUnit: "10k tokens"},
	}
}

func callsUsage() Price {
	return Price{
		ID: callPrice, BillingModel: ModelUsageBased, BillingTiming: TimingArrears, UnitAmountDecimal: dec("0.04"), DisplayLabel: "", DisplayOrder: 0,
		Meter: &Meter{EntitlementID: callsID, EntitlementSlug: "api-calls", EntitlementName: "API calls", SaleUnitFactor: dec("1"), SaleUnit: ""},
	}
}

func renewal(measures map[uuid.UUID]Measure, metered ...Price) Input {
	return Input{
		Kind: KindRenewal, Currency: "EUR", LicenseName: "Pro", Base: base(TimingAdvance),
		Metered: metered, Measures: measures, Advance: next, Arrears: elapsed,
	}
}

func mustCompose(t *testing.T, in Input) Composition {
	t.Helper()
	c, err := Compose(in)
	if err != nil {
		t.Fatalf("Compose: %v", err)
	}
	return c
}

// A renewal with one line of each type the composer makes:
// 123,457 API calls at 0.04 cents, 30,500 tokens over the limit at 8.00 EUR a
// 10k, and the next month's 29.00 EUR base.
func TestComposeRenewal(t *testing.T) {
	c := mustCompose(t, renewal(map[uuid.UUID]Measure{
		callsID:  {Usage: dec("123457"), Overage: decimal.Zero, Windows: 1, NegativeSegmentsFloored: 0, Limits: nil, Unlimited: true, Capped: false},
		tokensID: Sample(dec("130500"), Grant{Limit: dec("100000"), Unlimited: false, OveragePercent: 50}),
	}, tokensOverage(), callsUsage()))

	if len(c.Lines) != 3 {
		t.Fatalf("lines = %d, want 3: %+v", len(c.Lines), c.Lines)
	}
	usage, overage, baseLine := c.Lines[0], c.Lines[1], c.Lines[2]

	// Arrears lines first (they start earlier), USAGE before OVERAGE, then the
	// BASE of the period that starts.
	for i, want := range []LineType{LineUsage, LineOverage, LineBase} {
		if c.Lines[i].Type != want || c.Lines[i].Seq != i+1 {
			t.Errorf("line %d = %s seq %d, want %s seq %d", i, c.Lines[i].Type, c.Lines[i].Seq, want, i+1)
		}
	}

	if usage.Quantity != "123457" || usage.Amount != 4938 || usage.Label != "API calls" {
		t.Errorf("usage line = %+v", usage)
	}
	if overage.Quantity != "3.05" || overage.Amount != 2440 || overage.Label != "Tokens — overage" {
		t.Errorf("overage line = %+v", overage)
	}
	if overage.Metering.MeasuredQuantity != "30500" || overage.Metering.SaleUnitFactor != "10000" {
		t.Errorf("overage metering = %+v", overage.Metering)
	}
	if overage.Overage.UsageMeasured != "130500" || overage.Overage.OverageMeasured != "30500" {
		t.Errorf("overage arithmetic = %+v", overage.Overage)
	}
	wantDescription := "3.05 × 8.00 EUR (per 10k tokens); 130,500 used; 30,500 above the applied limit (100,000)"
	if overage.Description != wantDescription {
		t.Errorf("overage description = %q, want %q", overage.Description, wantDescription)
	}
	if !overage.ServiceFrom.Equal(elapsed.From) || !overage.ServiceTo.Equal(elapsed.To) {
		t.Errorf("overage service = %s..%s", overage.ServiceFrom, overage.ServiceTo)
	}

	if baseLine.Quantity != "1" || baseLine.Amount != 2900 || baseLine.Label != "Pro — base" || baseLine.Description != "1 × 29.00 EUR" {
		t.Errorf("base line = %+v", baseLine)
	}
	if !baseLine.ServiceFrom.Equal(next.From) || !baseLine.ServiceTo.Equal(next.To) {
		t.Errorf("base service = %s..%s", baseLine.ServiceFrom, baseLine.ServiceTo)
	}

	if c.Subtotal != 4938+2440+2900 || c.DiscountTotal != 0 || c.Total != c.Subtotal {
		t.Errorf("totals = %d / %d / %d", c.Subtotal, c.DiscountTotal, c.Total)
	}
}

func TestComposeWhichLinesABoundaryProduces(t *testing.T) {
	measures := map[uuid.UUID]Measure{callsID: {Usage: dec("10"), Overage: decimal.Zero, Windows: 1, NegativeSegmentsFloored: 0, Limits: nil, Unlimited: true, Capped: false}}
	types := func(c Composition) []LineType {
		var out []LineType
		for _, line := range c.Lines {
			out = append(out, line.Type)
		}
		return out
	}
	equal := func(a, b []LineType) bool {
		if len(a) != len(b) {
			return false
		}
		for i := range a {
			if a[i] != b[i] {
				return false
			}
		}
		return true
	}

	for _, tc := range []struct {
		name   string
		kind   Kind
		timing string
		want   []LineType
	}{
		{"activation bills an advance base only", KindActivation, TimingAdvance, []LineType{LineBase}},
		{"activation bills nothing of an arrears base", KindActivation, TimingArrears, nil},
		{"renewal bills arrears usage and the advance base", KindRenewal, TimingAdvance, []LineType{LineUsage, LineBase}},
		{"renewal bills an arrears base with the usage", KindRenewal, TimingArrears, []LineType{LineBase, LineUsage}},
		{"final bills no advance base", KindFinal, TimingAdvance, []LineType{LineUsage}},
		{"final bills an arrears base", KindFinal, TimingArrears, []LineType{LineBase, LineUsage}},
	} {
		in := renewal(measures, callsUsage())
		in.Kind, in.Base = tc.kind, base(tc.timing)
		if got := types(mustCompose(t, in)); !equal(got, tc.want) {
			t.Errorf("%s: lines = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestComposeMeteredLines(t *testing.T) {
	t.Run("NothingMeasured_NoLine", func(t *testing.T) {
		c := mustCompose(t, renewal(nil, callsUsage(), tokensOverage()))
		if len(c.Lines) != 1 || c.Lines[0].Type != LineBase {
			t.Errorf("lines = %+v", c.Lines)
		}
	})

	t.Run("APositiveQuantityWhoseAmountRoundsTo0_IsALine", func(t *testing.T) {
		c := mustCompose(t, renewal(map[uuid.UUID]Measure{
			callsID: {Usage: dec("10"), Overage: decimal.Zero, Windows: 1, NegativeSegmentsFloored: 0, Limits: nil, Unlimited: true, Capped: false},
		}, callsUsage()))
		if len(c.Lines) != 2 || c.Lines[0].Amount != 0 || c.Lines[0].Quantity != "10" {
			t.Errorf("lines = %+v", c.Lines)
		}
	})

	t.Run("AnUnlimitedMeter_BillsNoOverage", func(t *testing.T) {
		c := mustCompose(t, renewal(map[uuid.UUID]Measure{
			tokensID: Sample(dec("5000000"), Grant{Limit: decimal.Zero, Unlimited: true, OveragePercent: -1}),
		}, tokensOverage()))
		if len(c.Lines) != 1 {
			t.Errorf("lines = %+v", c.Lines)
		}
	})

	t.Run("AFlooredCorrection_IsSaid", func(t *testing.T) {
		c := mustCompose(t, renewal(map[uuid.UUID]Measure{
			callsID: {Usage: dec("5"), Overage: decimal.Zero, Windows: 2, NegativeSegmentsFloored: 1, Limits: nil, Unlimited: true, Capped: false},
		}, callsUsage()))
		if got := c.Lines[0].Description; got != "5 × 0.0004 EUR; corrections below 0 not credited" {
			t.Errorf("description = %q", got)
		}
	})

	t.Run("ADisplayLabel_WinsOverTheDerivedOne_AndDisplayOrderSortsTies", func(t *testing.T) {
		calls, tokens := callsUsage(), tokensOverage()
		calls.DisplayOrder, tokens.DisplayOrder = 5, 1
		tokens.BillingModel = ModelUsageBased
		tokens.DisplayLabel = "Model tokens"
		c := mustCompose(t, renewal(map[uuid.UUID]Measure{
			callsID:  {Usage: dec("1"), Overage: decimal.Zero, Windows: 1, NegativeSegmentsFloored: 0, Limits: nil, Unlimited: true, Capped: false},
			tokensID: {Usage: dec("1"), Overage: decimal.Zero, Windows: 1, NegativeSegmentsFloored: 0, Limits: nil, Unlimited: true, Capped: false},
		}, calls, tokens))
		if c.Lines[0].Label != "Model tokens" || c.Lines[1].Label != "API calls" {
			t.Errorf("labels = %q, %q", c.Lines[0].Label, c.Lines[1].Label)
		}
	})
}

// Rounding, one example per currency exponent, and a tie.
func TestComposeRounding(t *testing.T) {
	for _, tc := range []struct {
		currency money.Currency
		unit     string
		measured string
		amount   int64
		text     string
	}{
		{"EUR", "0.04", "123457", 4938, "123457 × 0.0004 EUR"},
		{"JPY", "0.5", "7", 4, "7 × 0.5 JPY"},
		{"KWD", "12.5", "1", 13, "1 × 0.0125 KWD"},
		{"EUR", "2.5", "1", 3, "1 × 0.025 EUR"},
	} {
		price := callsUsage()
		price.UnitAmountDecimal = dec(tc.unit)
		in := renewal(map[uuid.UUID]Measure{
			callsID: {Usage: dec(tc.measured), Overage: decimal.Zero, Windows: 1, NegativeSegmentsFloored: 0, Limits: nil, Unlimited: true, Capped: false},
		}, price)
		in.Currency = tc.currency
		line := mustCompose(t, in).Lines[0]
		if line.Amount != tc.amount || line.Description != tc.text {
			t.Errorf("%s %s × %s: amount %d %q, want %d %q", tc.currency, tc.measured, tc.unit, line.Amount, line.Description, tc.amount, tc.text)
		}
	}
}

func TestComposeOverflow(t *testing.T) {
	price := callsUsage()
	price.UnitAmountDecimal = dec("999999999999.999999999999")
	_, err := Compose(renewal(map[uuid.UUID]Measure{
		callsID: {Usage: dec("100000000"), Overage: decimal.Zero, Windows: 1, NegativeSegmentsFloored: 0, Limits: nil, Unlimited: true, Capped: false},
	}, price))
	if !errors.Is(err, ErrAmountOverflow) {
		t.Errorf("err = %v, want ErrAmountOverflow", err)
	}
}

func TestSample(t *testing.T) {
	grant := Grant{Limit: dec("100000"), Unlimited: false, OveragePercent: 50}
	for _, tc := range []struct {
		quantity, usage, overage string
		capped                   bool
	}{
		{"80000", "80000", "0", false},
		{"130500", "130500", "30500", false},
		{"150000", "150000", "50000", false},
		// 300,000 against 100,000 @ 50 % is 50,000 of overage.
		{"300000", "150000", "50000", true},
	} {
		m := Sample(dec(tc.quantity), grant)
		if m.Usage.String() != tc.usage || m.Overage.String() != tc.overage || m.Capped != tc.capped {
			t.Errorf("Sample(%s) = usage %s overage %s capped %v, want %s %s %v",
				tc.quantity, m.Usage, m.Overage, m.Capped, tc.usage, tc.overage, tc.capped)
		}
	}

	hard := Sample(dec("120"), Grant{Limit: dec("100"), Unlimited: false, OveragePercent: 0})
	if hard.Usage.String() != "100" || !hard.Overage.IsZero() || !hard.Capped {
		t.Errorf("hard limit = %+v", hard)
	}

	unlimited := Sample(dec("999"), Grant{Limit: decimal.Zero, Unlimited: true, OveragePercent: -1})
	if unlimited.Usage.String() != "999" || !unlimited.Overage.IsZero() || unlimited.Capped || !unlimited.Unlimited {
		t.Errorf("unlimited = %+v", unlimited)
	}
}

func TestAddMonthsClamped(t *testing.T) {
	day := func(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 9, 30, 0, 0, time.UTC) }
	for _, tc := range []struct {
		from time.Time
		k    int
		want time.Time
	}{
		{day(2027, 1, 31), 1, day(2027, 2, 28)},
		{day(2028, 1, 31), 1, day(2028, 2, 29)},
		{day(2027, 3, 31), -1, day(2027, 2, 28)},
		{day(2027, 1, 15), 12, day(2028, 1, 15)},
		{day(2027, 8, 31), 3, day(2027, 11, 30)},
		{day(2027, 1, 15), -1, day(2026, 12, 15)},
	} {
		if got := AddMonthsClamped(tc.from, tc.k); !got.Equal(tc.want) {
			t.Errorf("AddMonthsClamped(%s, %d) = %s, want %s", tc.from, tc.k, got, tc.want)
		}
	}
}

func TestPreviewSpansItsLines(t *testing.T) {
	c := mustCompose(t, renewal(map[uuid.UUID]Measure{
		callsID: {Usage: dec("1"), Overage: decimal.Zero, Windows: 1, NegativeSegmentsFloored: 0, Limits: nil, Unlimited: true, Capped: false},
	}, callsUsage()))
	p := Preview(KindRenewal, boundary, boundary, "pro-v1", "EUR", c)
	if p.Status != "PREVIEW" || !p.ServiceFrom.Equal(elapsed.From) || !p.ServiceTo.Equal(next.To) || p.WouldHold == nil {
		t.Errorf("preview = %+v", p)
	}
	empty := Preview(KindFinal, boundary, boundary, "pro-v1", "EUR", Composition{Lines: nil, Subtotal: 0, DiscountTotal: 0, Total: 0})
	if empty.Lines == nil || empty.ServiceFrom != nil {
		t.Errorf("empty preview = %+v", empty)
	}
}
