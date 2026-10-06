package stripe

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/provider"
)

// TaxBehavior is whether Kaiten's amounts exclude or include the tax Stripe
// computes or applies.
type TaxBehavior string

const (
	TaxExclusive TaxBehavior = "EXCLUSIVE"
	TaxInclusive TaxBehavior = "INCLUSIVE"
)

// Settings keys, as the connector stores them (connectors/stripe declares the
// same names in its manifest; the two are asserted equal in a test).
const (
	keySecretKey    = "stripeSecretKey"
	keyAutomaticTax = "automaticTax"
	keyTaxBehavior  = "taxBehavior"
	keyAutoFinalize = "autoFinalize"
)

// Settings are the connector's settings as the adapter uses them. The secret
// key is never printed: String, GoString and LogValue redact it.
type Settings struct {
	SecretKey    string
	AutomaticTax bool
	TaxBehavior  TaxBehavior
	AutoFinalize bool
}

// Livemode reports whether the key reaches the live account.
func (s Settings) Livemode() bool { return strings.HasPrefix(s.SecretKey, "rk_live_") }

func (s Settings) redacted() string {
	mode := "test"
	if s.Livemode() {
		mode = "live"
	}
	return fmt.Sprintf("stripe.Settings{key: rk_%s_[redacted], automaticTax: %t, taxBehavior: %s, autoFinalize: %t}",
		mode, s.AutomaticTax, s.TaxBehavior, s.AutoFinalize)
}

func (s Settings) String() string   { return s.redacted() }
func (s Settings) GoString() string { return s.redacted() }

// LogValue implements slog.LogValuer.
func (s Settings) LogValue() slog.Value { return slog.StringValue(s.redacted()) }

// Parse reads the stored connector settings into a provider connection's
// settings. Missing booleans and the tax behaviour take the manifest's
// defaults.
func Parse(stored map[string]any) (provider.ParsedSettings, error) {
	key, _ := stored[keySecretKey].(string)
	if key == "" {
		return provider.ParsedSettings{}, errors.New("stripe: the secret key is missing")
	}
	settings := Settings{SecretKey: key, AutomaticTax: false, TaxBehavior: TaxExclusive, AutoFinalize: true}
	if v, ok := stored[keyAutomaticTax]; ok {
		b, ok := v.(bool)
		if !ok {
			return provider.ParsedSettings{}, errors.New("stripe: automaticTax is not a boolean")
		}
		settings.AutomaticTax = b
	}
	if v, ok := stored[keyAutoFinalize]; ok {
		b, ok := v.(bool)
		if !ok {
			return provider.ParsedSettings{}, errors.New("stripe: autoFinalize is not a boolean")
		}
		settings.AutoFinalize = b
	}
	if v, ok := stored[keyTaxBehavior]; ok {
		s, _ := v.(string)
		switch TaxBehavior(s) {
		case TaxExclusive, TaxInclusive:
			settings.TaxBehavior = TaxBehavior(s)
		default:
			return provider.ParsedSettings{}, errors.New("stripe: taxBehavior is neither EXCLUSIVE nor INCLUSIVE")
		}
	}
	return provider.ParsedSettings{
		Settings: &settings, AutoFinalize: settings.AutoFinalize,
		InclusiveTax: settings.TaxBehavior == TaxInclusive, Livemode: settings.Livemode(),
	}, nil
}

// settingsOf is the adapter's settings from a provider Ref.
func settingsOf(settings any) (*Settings, error) {
	switch s := settings.(type) {
	case *Settings:
		if s != nil && s.SecretKey != "" {
			return s, nil
		}
	case Settings:
		if s.SecretKey != "" {
			return &s, nil
		}
	}
	return nil, &provider.Error{Class: provider.ClassNotConnected, Code: "settings_missing", Param: "", RequestID: "",
		Message: "the Stripe connector has no usable settings"}
}
