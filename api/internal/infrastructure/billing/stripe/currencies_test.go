package stripe

import (
	"slices"
	"testing"
)

// TestCurrencies pins the allow-list of §8.5 rule 6 (V31-54).
func TestCurrencies(t *testing.T) {
	caps := New(Options{}).Capabilities()
	for _, accepted := range []string{"EUR", "USD", "GBP", "CHF", "JPY", "KRW", "CLP", "XOF", "HUF", "TWD", "IDR"} {
		if !caps.AcceptsCurrency(accepted) {
			t.Errorf("%s is refused; Stripe charges it with the ISO exponent", accepted)
		}
	}
	for _, refused := range []string{
		"MGA",        // ISO 2, zero-decimal at Stripe: amounts 100x too high
		"ISK", "UGX", // two-decimal amounts ending in 00
		"BHD", "JOD", "KWD", "OMR", "TND", // three-decimal, UAE accounts only
		"IQD", "LYD", "CLF", "UYW", "UYI", "STN", "MRU", "VES", // not offered
	} {
		if caps.AcceptsCurrency(refused) {
			t.Errorf("%s is accepted; §8.5 rule 6 refuses it", refused)
		}
	}
	if slices.Contains(Currencies, "STD") {
		t.Error("STD, withdrawn in 2018, is not an ISO currency the exponent table knows")
	}
	if len(Currencies) < 120 {
		t.Errorf("%d currencies: the presentment list lost entries", len(Currencies))
	}
}
