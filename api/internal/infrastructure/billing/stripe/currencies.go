package stripe

import "github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/money"

// MaxInvoiceItems is the most invoice items Stripe takes on one invoice
// (§8.7, V31-61).
const MaxInvoiceItems = 250

// presentment is Stripe's presentment currencies for an account outside the
// United Arab Emirates (docs.stripe.com/currencies; FR and US accounts list
// the same). The five three-decimal currencies, offered to UAE accounts only,
// are not on it.
var presentment = []string{
	"AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
	"BAM", "BBD", "BDT", "BGN", "BIF", "BMD", "BND", "BOB", "BRL", "BSD",
	"BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY", "COP", "CRC",
	"CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ETB", "EUR", "FJD",
	"FKP", "GBP", "GEL", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL",
	"HTG", "HUF", "IDR", "ILS", "INR", "ISK", "JMD", "JPY", "KES", "KGS",
	"KHR", "KMF", "KRW", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL",
	"MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MUR", "MVR", "MWK",
	"MXN", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "PAB",
	"PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB",
	"RWF", "SAR", "SBD", "SCR", "SEK", "SGD", "SHP", "SLE", "SOS", "SRD",
	"STD", "SZL", "THB", "TJS", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH",
	"UGX", "USD", "UYU", "UZS", "VND", "VUV", "WST", "XAF", "XCD", "XOF",
	"XPF", "YER", "ZAR", "ZMW",
}

// zeroDecimal are the currencies Stripe counts in whole units; it counts
// every other presentment currency in hundredths.
var zeroDecimal = map[string]bool{
	"BIF": true, "CLP": true, "DJF": true, "GNF": true, "JPY": true, "KMF": true, "KRW": true, "MGA": true,
	"PYG": true, "RWF": true, "UGX": true, "VND": true, "VUV": true, "XAF": true, "XOF": true, "XPF": true,
}

// specialCases are presentment currencies Stripe takes as two-decimal
// amounts ending in 00: ISK, and UGX, which it rounds to a multiple of 100,
// moving the difference to the customer balance. Neither reconciles at
// tolerance 0.
var specialCases = map[string]bool{"ISK": true, "UGX": true}

// Currencies is the adapter's allow-list (§8.5 rule 6, V31-54): the
// presentment currencies whose ISO 4217 exponent is Stripe's, without the
// special cases. MGA (ISO 2, Stripe 0) falls out, and so does every code the
// exponent table does not know (STD, withdrawn for STN). HUF and TWD are on
// it: Stripe charges two-decimal amounts in them; only manual payouts must
// be multiples of 100.
var Currencies = allowList()

func allowList() []string {
	out := make([]string, 0, len(presentment))
	for _, code := range presentment {
		if specialCases[code] {
			continue
		}
		currency, err := money.ParseCurrency(code)
		if err != nil {
			continue
		}
		exponent := int32(2)
		if zeroDecimal[code] {
			exponent = 0
		}
		if currency.Exponent() == exponent {
			out = append(out, code)
		}
	}
	return out
}
