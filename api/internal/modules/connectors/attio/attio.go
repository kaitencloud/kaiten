// Package attio is Kaiten's built-in CRM connector: it mirrors customers into Attio
// companies and instances into Attio workspaces, and writes the link back onto the
// Kaiten record so the console can show what is synced.
package attio

import (
	"github.com/kaitencloud/kaiten/api/internal/builtinconnectors"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/attio/attioclient"
	"github.com/kaitencloud/kaiten/api/pkg/dogfooding"
)

// Name is the connector's stable identifier, and the adapter name under which its
// links are stored on customer_integrations and instance_integrations.
//
// It is a wire contract several times over -- the console addresses the connector by
// it, the settings live at a Vault path built from it, and every existing integration
// row names it -- so it does not change.
const Name = "kaiten.integration.crm.attio"

// ConsumerName is this consumer's identity in the inbox_events dedup key.
//
// Prefixed, so that connectors cannot collide with a consumer that is not one: the
// audit trail is "audit-trail", and every connector is "connector:<name>". Like every
// consumer name it is a persisted key and must stay stable across deployments.
const ConsumerName = "connector:" + Name

// Version is what the manifest registers. It carries no behaviour -- registration
// upserts on the name -- but it is what an operator reads to tell which build of the
// connector a deployment is running.
const Version = "2.0.0"

// Manifest is what this connector declares about itself at startup.
//
// The settings schema is the console's contract: it decides which fields the settings
// form shows, and `writeOnly` is what marks the API key as a secret to redact on the
// way back out. It is Go here rather than the .manifest.json a separate process used
// to load, because a connector compiled into this binary ships its manifest in it --
// there is no file to go missing and no path to configure.
//
// EntitlementSlug is what a licence is checked against before an organization may
// activate this. It is set here, by the connector, rather than mapped anywhere central
// -- see the column comment in 20260821010000_connector_activation.sql.
func Manifest() builtinconnectors.Manifest {
	slug := dogfooding.ConnectorAttioEntitlementSlug

	return builtinconnectors.Manifest{
		Name:            Name,
		Version:         Version,
		EntitlementSlug: &slug,
		SettingsSchema: map[string]any{
			"$schema":              "https://json-schema.org/draft/2020-12/schema",
			"type":                 "object",
			"additionalProperties": false,
			"required":             []any{"attioApiKey", "attioApiUrl", "syncPolicy", "fieldsMapping"},
			"properties": map[string]any{
				"attioApiKey": map[string]any{
					"type":      "string",
					"writeOnly": true,
				},
				// Attio's own API and nothing else; see attioclient.BaseURL.
				"attioApiUrl": map[string]any{"type": "string", "const": attioclient.BaseURL},
				"syncPolicy":  map[string]any{"type": "string"},
				"fieldsMapping": map[string]any{
					"type":                 "object",
					"additionalProperties": map[string]any{"type": "string"},
				},
			},
		},
	}
}
