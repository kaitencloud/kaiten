// Package connectorhooks is what one connector runs at the moments of its lifecycle,
// over and above what every connector gets (a schema check, a Vault blob and
// an activation row).
//
// It is a port the connectors module owns and another module satisfies, by
// shape, without importing it: billing implements it for the connectors that
// configure a payment provider, so that refusing a key the provider rejects,
// refusing a disconnect while invoices still route there, and announcing the
// connection are the provider's rules, written once, rather than special
// cases inside the generic use cases. A connector without hooks behaves as it
// always has.
package connectorhooks

import (
	"context"

	"github.com/google/uuid"
)

// Hooks are one connector's lifecycle rules. Errors are returned to the caller
// as they are, so a hook answers with the calling use case's own code.
type Hooks interface {
	// ValidateSettings runs on PUT …/settings once the write-only fields are
	// merged and the schema validated, before the connector is activated and
	// before anything is stored. stored is nil on a first configuration.
	ValidateSettings(ctx context.Context, organizationID uuid.UUID, merged, stored map[string]any) error
	// CanDeactivate guards DELETE …/activation and DELETE …/settings.
	// operation is the calling use case, the prefix of the code it refuses
	// with ("DeactivateConnector", "DeleteConnectorSettings").
	CanDeactivate(ctx context.Context, organizationID uuid.UUID, operation string) error
	// Activated runs in the transaction that inserted the activation row, and
	// only when it inserted it. settings are the ones being stored, or the
	// stored ones on an explicit activation; nil when there are none.
	Activated(ctx context.Context, organizationID uuid.UUID, settings map[string]any) error
	// Deactivated runs in the transaction that removed the activation row,
	// and only when it removed one. settings are the stored ones, read before
	// anything was deleted; nil when there are none.
	Deactivated(ctx context.Context, organizationID uuid.UUID, settings map[string]any) error
}

// Registry maps connector names to their hooks.
type Registry map[string]Hooks

// For returns the connector's hooks, or ones that do nothing.
func (r Registry) For(connectorName string) Hooks {
	if h, ok := r[connectorName]; ok && h != nil {
		return h
	}
	return none{}
}

// Has reports whether the connector has hooks of its own.
func (r Registry) Has(connectorName string) bool {
	h, ok := r[connectorName]
	return ok && h != nil
}

type none struct{}

func (none) ValidateSettings(context.Context, uuid.UUID, map[string]any, map[string]any) error {
	return nil
}
func (none) CanDeactivate(context.Context, uuid.UUID, string) error       { return nil }
func (none) Activated(context.Context, uuid.UUID, map[string]any) error   { return nil }
func (none) Deactivated(context.Context, uuid.UUID, map[string]any) error { return nil }
