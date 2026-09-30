// Package builtinconnectors registers the manifests of the connectors this binary
// ships, once, while the process is starting.
//
// # Why a driver rather than a step in the object graph
//
// Registration is an action, not a construction: it writes a row. internal/kaiten
// assembles use cases and does not run them, so a call to Execute in newModules would
// be the one line in that package with an effect -- and the effect would happen
// before any driver had said whether this process is a server, the docs generator or
// a test.
//
// So this is shaped like internal/platform/jit: it declares the one method it needs
// as its own interface, satisfied structurally by kaiten.InProcess, and never imports
// internal/kaiten. The composition root passes the surface in; nothing here can reach
// anything else on it.
//
// # Why in-process and not over HTTP
//
// A built-in connector registers before the server is serving, so there is no
// endpoint to call, and it holds no credential, so there would be nothing to call it
// with. The same domain logic answers a connector hosted elsewhere over
// POST /platform/connectors -- one use case, two ways in, which is what keeps them
// from drifting about what a registration means.
package builtinconnectors

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/registerconnector"
	"github.com/kaitencloud/kaiten/api/internal/modules/connectors/schema"
)

// Manifest is what one built-in connector declares about itself: the same body a
// connector hosted elsewhere would POST.
//
// The type alias rather than a struct of our own is deliberate. A separate shape here
// would be a second definition of "what a registration is", and the first thing it
// would do is fall behind the one the endpoint publishes.
type Manifest = registerconnector.RegisterConnectorBody

// registrar is the one facade method this package calls, declared here rather than
// imported so that internal/kaiten stays a dependency of nothing.
type registrar interface {
	RegisterConnector(ctx context.Context, body Manifest) (*schema.Connector, error)
}

// Registrar registers a fixed set of manifests.
type Registrar struct {
	surface   registrar
	manifests []Manifest
}

// New builds the registrar for the connectors this binary ships.
func New(surface registrar, manifests ...Manifest) *Registrar {
	return &Registrar{surface: surface, manifests: manifests}
}

// RegisterAll registers every built-in manifest, and fails on the first one that
// cannot be registered.
//
// Failing is deliberate, and the caller is expected to fail startup with it. A
// connector whose manifest is missing is not a degraded connector: updatesettings and
// getsettings both refuse to work against an unregistered name, so the deployment
// would come up looking healthy while every attempt to configure that connector was
// rejected as though the connector did not exist -- which, as far as the database is
// concerned, it would not.
//
// Safe to run on every start. The use case upserts on the name, so a restart
// converges on one row and a version bump updates it in place; there is no
// "already registered" case for a caller to handle.
func (r *Registrar) RegisterAll(ctx context.Context) error {
	for _, manifest := range r.manifests {
		if _, err := r.surface.RegisterConnector(ctx, manifest); err != nil {
			return fmt.Errorf("register built-in connector %q: %w", manifest.Name, err)
		}
	}

	return nil
}
