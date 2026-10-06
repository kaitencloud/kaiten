// Package money is how the billing code counts money: in a currency's minor
// units, never in floats.
//
//   - A currency is an ISO 4217 alphabetic code whose exponent this package
//     knows: EUR and USD have 2 decimal places, JPY 0, KWD 3.
//   - An amount is an int64 number of minor units: cents, yen, fils.
//   - A unit price is a decimal number of minor units with up to 12 decimal
//     places -- 0.0002 cents a token is a price -- and up to 12 integer digits,
//     which is what NUMERIC(24,12) stores without rounding.
//   - A line amount is a quantity times a unit price, rounded half up once.
//
// Decimals cross the database boundary as text, so nothing is ever converted
// through a float.
package money

import (
	"errors"
	"fmt"
	"strings"

	"github.com/shopspring/decimal"
)

// MaxScale is the most decimal places a unit price or a quantity carries.
const MaxScale = 12

// maxIntegerDigits is the most integer digits a unit price carries.
const maxIntegerDigits = 12

var (
	// ErrUnknownCurrency is a code that is not an ISO 4217 currency this
	// package knows the exponent of.
	ErrUnknownCurrency = errors.New("not an ISO 4217 currency code")
	// ErrInvalidAmount is a unit price that is not a non-negative decimal of at
	// most 12 integer digits and 12 decimal places.
	ErrInvalidAmount = errors.New("not a non-negative decimal of at most 12 integer digits and 12 decimal places")
)

// Currency is an upper-case ISO 4217 alphabetic code.
type Currency string

// ParseCurrency reads an ISO 4217 code. It must be upper case and known.
func ParseCurrency(code string) (Currency, error) {
	if _, ok := exponents[code]; !ok {
		return "", fmt.Errorf("%q: %w", code, ErrUnknownCurrency)
	}
	return Currency(code), nil
}

// Exponent is how many decimal places the currency's minor unit has.
func (c Currency) Exponent() int32 {
	return exponents[string(c)]
}

// ParseUnitAmount reads a unit price in minor units: a non-negative decimal of
// at most 12 integer digits and 12 decimal places. More would be rounded or
// refused by the database, silently or not, so it is refused here.
func ParseUnitAmount(s string) (decimal.Decimal, error) {
	d, err := decimal.NewFromString(strings.TrimSpace(s))
	if err != nil || d.IsNegative() || scale(d) > MaxScale || integerDigits(d) > maxIntegerDigits {
		return decimal.Decimal{}, fmt.Errorf("%q: %w", s, ErrInvalidAmount)
	}
	return d, nil
}

// FormatDecimal writes d as the API shows decimals: plain notation, trailing
// zeros trimmed ("800", "0.0002", "3.05").
func FormatDecimal(d decimal.Decimal) string {
	return d.String()
}

// IntegralMinor is d as an int64 when it is a whole number of minor units:
// the unitAmount the API shows next to unitAmountDecimal. False otherwise.
func IntegralMinor(d decimal.Decimal) (int64, bool) {
	if !d.Equal(d.Truncate(0)) || !d.Abs().LessThan(decimal.New(1, 18)) {
		return 0, false
	}
	return d.IntPart(), true
}

// RoundMinor rounds a non-negative amount in minor units half up to a whole
// number of them: 0.5 → 1, 2.5 → 3. The rounding is applied to the magnitude,
// so a discount is the negation of a rounded non-negative amount, never a
// rounded negative one.
func RoundMinor(d decimal.Decimal) int64 {
	if d.IsNegative() {
		return -RoundMinor(d.Neg())
	}
	return d.Round(0).IntPart()
}

// Amount is quantity × unitAmount, rounded half up once: the amount of an
// invoice line in minor units.
func Amount(quantity, unitAmount decimal.Decimal) int64 {
	return RoundMinor(quantity.Mul(unitAmount))
}

// Quantity is measured ÷ factor, rounded half up to 12 decimal places: a count
// of measured units turned into sale units ("30500" tokens at 10000 a sale
// unit is "3.05").
func Quantity(measured, factor decimal.Decimal) decimal.Decimal {
	if factor.IsZero() {
		return decimal.Zero
	}
	// One rounding, on the exact quotient: rounding to more places first and
	// then to 12 could carry a digit past the half that the exact value is not.
	return measured.DivRound(factor, MaxScale)
}

func scale(d decimal.Decimal) int32 {
	trimmed := decimal.RequireFromString(d.String())
	if trimmed.Exponent() >= 0 {
		return 0
	}
	return -trimmed.Exponent()
}

func integerDigits(d decimal.Decimal) int {
	digits := d.Truncate(0).Abs().String()
	if digits == "0" {
		return 0
	}
	return len(digits)
}

// exponents are the minor-unit exponents of the active ISO 4217 currencies.
var exponents = map[string]int32{
	// Zero decimal places.
	"BIF": 0, "CLP": 0, "DJF": 0, "GNF": 0, "ISK": 0, "JPY": 0, "KMF": 0, "KRW": 0,
	"PYG": 0, "RWF": 0, "UGX": 0, "UYI": 0, "VND": 0, "VUV": 0, "XAF": 0, "XOF": 0, "XPF": 0,
	// Three decimal places.
	"BHD": 3, "IQD": 3, "JOD": 3, "KWD": 3, "LYD": 3, "OMR": 3, "TND": 3,
	// Four decimal places.
	"CLF": 4, "UYW": 4,
	// Two decimal places.
	"AED": 2, "AFN": 2, "ALL": 2, "AMD": 2, "ANG": 2, "AOA": 2, "ARS": 2, "AUD": 2, "AWG": 2,
	"AZN": 2, "BAM": 2, "BBD": 2, "BDT": 2, "BGN": 2, "BMD": 2, "BND": 2, "BOB": 2, "BRL": 2,
	"BSD": 2, "BTN": 2, "BWP": 2, "BYN": 2, "BZD": 2, "CAD": 2, "CDF": 2, "CHF": 2, "CNY": 2,
	"COP": 2, "CRC": 2, "CUP": 2, "CVE": 2, "CZK": 2, "DKK": 2, "DOP": 2, "DZD": 2, "EGP": 2,
	"ERN": 2, "ETB": 2, "EUR": 2, "FJD": 2, "FKP": 2, "GBP": 2, "GEL": 2, "GHS": 2, "GIP": 2,
	"GMD": 2, "GTQ": 2, "GYD": 2, "HKD": 2, "HNL": 2, "HTG": 2, "HUF": 2, "IDR": 2, "ILS": 2,
	"INR": 2, "IRR": 2, "JMD": 2, "KES": 2, "KGS": 2, "KHR": 2, "KPW": 2, "KYD": 2, "KZT": 2,
	"LAK": 2, "LBP": 2, "LKR": 2, "LRD": 2, "LSL": 2, "MAD": 2, "MDL": 2, "MGA": 2, "MKD": 2,
	"MMK": 2, "MNT": 2, "MOP": 2, "MRU": 2, "MUR": 2, "MVR": 2, "MWK": 2, "MXN": 2, "MYR": 2,
	"MZN": 2, "NAD": 2, "NGN": 2, "NIO": 2, "NOK": 2, "NPR": 2, "NZD": 2, "PAB": 2, "PEN": 2,
	"PGK": 2, "PHP": 2, "PKR": 2, "PLN": 2, "QAR": 2, "RON": 2, "RSD": 2, "RUB": 2, "SAR": 2,
	"SBD": 2, "SCR": 2, "SDG": 2, "SEK": 2, "SGD": 2, "SHP": 2, "SLE": 2, "SOS": 2, "SRD": 2,
	"SSP": 2, "STN": 2, "SVC": 2, "SYP": 2, "SZL": 2, "THB": 2, "TJS": 2, "TMT": 2, "TOP": 2,
	"TRY": 2, "TTD": 2, "TWD": 2, "TZS": 2, "UAH": 2, "USD": 2, "UYU": 2, "UZS": 2, "VES": 2,
	"WST": 2, "XCD": 2, "YER": 2, "ZAR": 2, "ZMW": 2, "ZWG": 2,
}
