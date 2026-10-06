package money

import (
	"errors"
	"testing"

	"github.com/shopspring/decimal"
)

func TestParseCurrency(t *testing.T) {
	for code, exponent := range map[string]int32{"EUR": 2, "USD": 2, "JPY": 0, "KRW": 0, "KWD": 3, "TND": 3, "CLF": 4} {
		c, err := ParseCurrency(code)
		if err != nil || c.Exponent() != exponent {
			t.Errorf("ParseCurrency(%q) = %q (exponent %d), %v; want exponent %d", code, c, c.Exponent(), err, exponent)
		}
	}
	for _, code := range []string{"eur", "EU", "EURO", "XXX", "", "ABC"} {
		if _, err := ParseCurrency(code); !errors.Is(err, ErrUnknownCurrency) {
			t.Errorf("ParseCurrency(%q) error = %v, want ErrUnknownCurrency", code, err)
		}
	}
}

func TestParseUnitAmount(t *testing.T) {
	for in, want := range map[string]string{
		"0":                         "0",
		"800":                       "800",
		"0.0002":                    "0.0002",
		"2900.50":                   "2900.5",
		"999999999999.999999999999": "999999999999.999999999999",
		"0.000000000001":            "0.000000000001",
		"1.500000000000000":         "1.5", // trailing zeros are not decimal places
	} {
		got, err := ParseUnitAmount(in)
		if err != nil || FormatDecimal(got) != want {
			t.Errorf("ParseUnitAmount(%q) = %s, %v; want %s", in, FormatDecimal(got), err, want)
		}
	}
	for _, in := range []string{"-1", "1e3x", "", "abc", "1000000000000", "0.0000000000001", "NaN"} {
		if _, err := ParseUnitAmount(in); !errors.Is(err, ErrInvalidAmount) {
			t.Errorf("ParseUnitAmount(%q) error = %v, want ErrInvalidAmount", in, err)
		}
	}
}

func TestIntegralMinor(t *testing.T) {
	if v, ok := IntegralMinor(decimal.RequireFromString("2900")); !ok || v != 2900 {
		t.Errorf("IntegralMinor(2900) = %d, %v", v, ok)
	}
	if _, ok := IntegralMinor(decimal.RequireFromString("0.0002")); ok {
		t.Error("IntegralMinor(0.0002) is not a whole number of minor units")
	}
}

func TestRoundMinorIsHalfUpOnTheMagnitude(t *testing.T) {
	for in, want := range map[string]int64{"0.5": 1, "2.5": 3, "2.4999": 2, "0": 0, "-0.5": -1, "-2.5": -3, "1234.5": 1235} {
		if got := RoundMinor(decimal.RequireFromString(in)); got != want {
			t.Errorf("RoundMinor(%s) = %d, want %d", in, got, want)
		}
	}
}

func TestQuantityAndAmount(t *testing.T) {
	// The spec's example: 30,500 tokens at 10,000 a sale unit, 8.00 EUR a sale unit.
	quantity := Quantity(decimal.RequireFromString("30500"), decimal.RequireFromString("10000"))
	if FormatDecimal(quantity) != "3.05" {
		t.Fatalf("Quantity = %s, want 3.05", quantity)
	}
	if amount := Amount(quantity, decimal.RequireFromString("800")); amount != 2440 {
		t.Errorf("Amount = %d, want 2440", amount)
	}
	// A per-token price: 1,234,567 tokens at 0.0002 cents is 246.9134 → 247 cents.
	if amount := Amount(decimal.RequireFromString("1234567"), decimal.RequireFromString("0.0002")); amount != 247 {
		t.Errorf("Amount = %d, want 247", amount)
	}
	// Quantities keep 12 decimal places at most, half up.
	if got := FormatDecimal(Quantity(decimal.NewFromInt(1), decimal.NewFromInt(3))); got != "0.333333333333" {
		t.Errorf("Quantity(1/3) = %s", got)
	}
	if got := FormatDecimal(Quantity(decimal.NewFromInt(2), decimal.NewFromInt(3))); got != "0.666666666667" {
		t.Errorf("Quantity(2/3) = %s", got)
	}
}
