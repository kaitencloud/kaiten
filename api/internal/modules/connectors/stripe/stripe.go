// Package stripe is Kaiten's built-in billing connector: the organization's
// Stripe account, which issues, presents and collects the invoices Kaiten
// composes (invoice push).
//
// This package is the connector's declaration only: its name, its version and
// the settings an organization stores. It imports no Stripe code; the adapter
// that talks to Stripe is infrastructure/billing/stripe, the only place
// stripe-go may be imported, and billing binds the two.
package stripe

import (
	"github.com/kaitencloud/kaiten/api/internal/builtinconnectors"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// Name is the connector's stable identifier. Connector names are reverse-DNS
// under kaiten. (common.ValidateConnectorName), so "the stripe connector" of
// the specification registers under this one; the settings live at the Vault
// path derived from it, and the console maps its route id "stripe" to it.
const Name = "kaiten.integration.billing.stripe"

// Version is what the manifest registers: what an operator reads to tell which
// build of the connector a deployment runs.
const Version = "1.0.0"

// Settings keys, as the organization stores them.
const (
	SettingSecretKey    = "stripeSecretKey"
	SettingAutomaticTax = "automaticTax"
	SettingTaxBehavior  = "taxBehavior"
	SettingAutoFinalize = "autoFinalize"
)

// Manifest is what this connector declares about itself at startup.
//
// The secret key is a restricted key (rk_), writeOnly so that it is never read
// back. It needs Customers, Invoices and Invoice items write, and Events read.
// Activation is gated on the connector-stripe entitlement, which a deployment
// with no licensing authority (self-hosted) always grants.
func Manifest() builtinconnectors.Manifest {
	slug := dogfooding.ConnectorStripeEntitlementSlug

	return builtinconnectors.Manifest{
		Name:            Name,
		Version:         Version,
		EntitlementSlug: &slug,
		SettingsSchema: map[string]any{
			"$schema":              "https://json-schema.org/draft/2020-12/schema",
			"type":                 "object",
			"additionalProperties": false,
			"required":             []any{SettingSecretKey},
			"properties": map[string]any{
				SettingSecretKey: map[string]any{
					"type":        "string",
					"writeOnly":   true,
					"pattern":     "^rk_(live|test)_[A-Za-z0-9]+$",
					"description": "A restricted key of the Stripe account (rk_live_… or rk_test_…)",
				},
				SettingAutomaticTax: map[string]any{
					"type":        "boolean",
					"default":     false,
					"description": "Let Stripe Tax compute the tax of every invoice",
				},
				SettingTaxBehavior: map[string]any{
					"type":        "string",
					"enum":        []any{"EXCLUSIVE", "INCLUSIVE"},
					"default":     "EXCLUSIVE",
					"description": "Whether Kaiten's amounts exclude or include the tax",
				},
				SettingAutoFinalize: map[string]any{
					"type":        "boolean",
					"default":     true,
					"description": "Finalize each invoice at once; false leaves it as a Stripe draft for review",
				},
			},
		},
	}
}
