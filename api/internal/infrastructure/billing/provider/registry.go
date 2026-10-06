package provider

import (
	"context"
	"slices"

	"github.com/google/uuid"
)

// Registry resolves the providers an organization can bill through.
type Registry interface {
	// Kinds lists the providers this deployment knows, NOOP first.
	Kinds() []Kind
	// Capabilities are a known provider's, without resolving a connection.
	Capabilities(kind Kind) (Capabilities, bool)
	// Resolve connects a provider for an organization; ErrNotConnected when
	// the organization has not connected it, or the deployment does not
	// know it.
	Resolve(ctx context.Context, organizationID uuid.UUID, kind Kind) (*Connection, error)
}

// Resolver connects one provider for an organization.
type Resolver func(ctx context.Context, organizationID uuid.UUID) (*Connection, error)

// Static is a Registry over a fixed set of providers. NOOP is always
// registered and always connected.
type Static struct {
	adapters  map[Kind]Adapter
	resolvers map[Kind]Resolver
	order     []Kind
}

// NewStatic returns a registry knowing NOOP only.
func NewStatic(noop Adapter) *Static {
	s := &Static{adapters: map[Kind]Adapter{}, resolvers: map[Kind]Resolver{}, order: nil}
	s.Register(noop, func(_ context.Context, organizationID uuid.UUID) (*Connection, error) {
		return &Connection{Adapter: noop, Ref: Ref{OrganizationID: organizationID, Settings: nil}, AutoFinalize: true, InclusiveTax: false}, nil
	})
	return s
}

// Register adds a provider, or replaces the one of its kind.
func (s *Static) Register(adapter Adapter, resolve Resolver) {
	kind := adapter.Kind()
	if !slices.Contains(s.order, kind) {
		s.order = append(s.order, kind)
	}
	s.adapters[kind] = adapter
	s.resolvers[kind] = resolve
}

// Kinds implements Registry.
func (s *Static) Kinds() []Kind { return slices.Clone(s.order) }

// Capabilities implements Registry.
func (s *Static) Capabilities(kind Kind) (Capabilities, bool) {
	adapter, ok := s.adapters[kind]
	if !ok {
		return Capabilities{}, false
	}
	return adapter.Capabilities(), true
}

// Resolve implements Registry.
func (s *Static) Resolve(ctx context.Context, organizationID uuid.UUID, kind Kind) (*Connection, error) {
	resolve, ok := s.resolvers[kind]
	if !ok {
		return nil, ErrNotConnected
	}
	return resolve(ctx, organizationID)
}
