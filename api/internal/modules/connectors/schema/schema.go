package schema

import "time"

// ConnectorActivation is one organization's decision to use one connector.
//
// Its keys are camelCase, unlike the older connector schemas beside it. Those spell
// connector_name and settings_schema, which the contract's naming test lists as a
// frozen bug that may only shrink -- renaming a key breaks live clients, so the fix
// is its own unit of work. New components do not inherit it.
type ConnectorActivation struct {
	ConnectorName string    `json:"connectorName" doc:"Stable connector identifier" example:"kaiten.integration.crm.attio"`
	ActivatedAt   time.Time `json:"activatedAt" doc:"When this organization first activated the connector"`
}

// ConnectorState is everything the frontend needs to decide what to render for one
// connector, in one request.
//
// Three independent booleans rather than one status enum, because they are three
// independent facts and collapsing them loses the distinction that matters: an
// organization that is not entitled and one that simply has not switched the
// connector on need different words, and a client that only had "inactive" could not
// tell them apart. A client that wants a single state derives it -- available &&
// entitled && activated -- which is a decision it can make and this API cannot.
//
// Available is false rather than a 404 for a connector this deployment does not have.
// The question asked is "what is the state of this connector for me", and "it is not
// available" is an answer to it; a 404 would repeat exactly the conflation this
// endpoint exists to end, where the settings endpoint's 404 meant "not registered",
// "not configured" and "not allowed" at once.
type ConnectorState struct {
	ConnectorName string     `json:"connectorName" doc:"Stable connector identifier" example:"kaiten.integration.crm.attio"`
	Available     bool       `json:"available" doc:"Whether this deployment has the connector registered"`
	Entitled      bool       `json:"entitled" doc:"Whether this organization's licence includes the connector. True for an ungated connector."`
	Activated     bool       `json:"activated" doc:"Whether this organization has turned the connector on"`
	Version       *string    `json:"version,omitempty" doc:"Registered connector version. Absent when the connector is not available." example:"1.0.0"`
	ActivatedAt   *time.Time `json:"activatedAt,omitempty" doc:"When this organization activated the connector. Absent when it has not."`
}

// ConnectorSettings is the one schema for this resource, reused unmodified as
// both the PUT request body and the GET/PUT response. ConnectorName is
// readOnly:"true" because it is never taken from the body -- it comes from
// the path on every operation and is only ever reported back, never chosen by
// a write -- not because it is server-generated. Required stays as-is: huma
// validates required+readOnly leniently on the request side (a client
// omitting it is not rejected) while still publishing it as always-present on
// reads.
type ConnectorSettings struct {
	ConnectorName string         `json:"connector_name" readOnly:"true" doc:"Stable connector identifier" example:"kaiten.integration.crm.attio"`
	Settings      map[string]any `json:"settings" doc:"Connector settings payload"`
}

type ConnectorSettingsSchema struct {
	ConnectorName string         `json:"connector_name" doc:"Stable connector identifier" example:"kaiten.integration.crm.attio"`
	Version       string         `json:"version" doc:"Registered connector version" example:"1.0.0"`
	Schema        map[string]any `json:"schema" doc:"JSON schema describing supported connector settings payload"`
}

type Connector struct {
	Name           string         `json:"name" doc:"Stable connector identifier" example:"kaiten.integration.crm.attio"`
	Version        string         `json:"version" doc:"Registered connector version" example:"1.0.0"`
	SettingsSchema map[string]any `json:"settings_schema" doc:"JSON schema used to validate connector settings payloads"`
	// EntitlementSlug is what an organization's license is checked against before it
	// may activate this connector. Absent means ungated.
	EntitlementSlug *string   `json:"entitlement_slug,omitempty" doc:"Slug of the BOOLEAN entitlement a license must grant for an organization to activate this connector. Absent means the connector is ungated." example:"connector-attio"`
	CreatedAt       time.Time `json:"created_at" doc:"Timestamp when connector was first registered"`
	UpdatedAt       time.Time `json:"updated_at" doc:"Timestamp when connector registration was last updated"`
}
