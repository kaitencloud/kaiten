package dataloader

import (
	"context"
	"errors"
	"fmt"

	"github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/services"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// ErrNotFound is returned when an entity is not found.
var ErrNotFound = errors.New("not found")

// ErrMissingIdentity is returned when identity is not in context.
var ErrMissingIdentity = errors.New("missing identity in context")

// ErrLoaderNotRegistered is returned when the requested dataloader is absent
// from the container: either the container never reached the context, or no
// loader of that name and type was registered. Both are wiring bugs, to be
// surfaced as internal failures -- never as an identity problem, which sends
// whoever reads the error hunting an authentication bug that is not there.
var ErrLoaderNotRegistered = errors.New("dataloader not registered")

// contextKey is used to store the loaders in the context.
type contextKey string

const loadersKey contextKey = "dataloaders"

// Loaders holds all registered dataloaders for GraphQL.
// Modules register their dataloaders here.
type Loaders struct {
	loaders map[string]any

	// reporter meters what the nested resolvers read. Never nil -- a no-op one
	// stands in when dogfooding is off, same convention as everywhere else
	// usage is reported.
	reporter services.UsageReporter
}

// NewLoaders creates a new empty Loaders container. reporter is what Metered
// loaders bill their read through; a nil one becomes a no-op reporter.
func NewLoaders(reporter services.UsageReporter) *Loaders {
	return &Loaders{
		loaders:  make(map[string]any),
		reporter: services.UsageReporterOrNoop(reporter),
	}
}

// Register adds a dataloader to the container.
func (l *Loaders) Register(name string, loader any) {
	l.loaders[name] = loader
}

// Get retrieves a dataloader by name.
func (l *Loaders) Get(name string) any {
	return l.loaders[name]
}

// Metered wraps batchFn so that every batch it runs reports exactly one usage
// event for entitlementSlug -- the same single report the equivalent REST
// list/get handler fires for the same read, regardless of how many rows come
// back.
func Metered[K comparable, V any](
	l *Loaders,
	entitlementSlug string,
	batchFn dataloader.BatchFunc[K, V],
) dataloader.BatchFunc[K, V] {
	return func(ctx context.Context, keys []K) []*dataloader.Result[V] {
		results := batchFn(ctx, keys)

		// A batch that produced nothing usable read nothing worth billing --
		// the REST handlers likewise report only once past their own error
		// return.
		if l == nil || !anySucceeded(results) {
			return results
		}

		currentUser, ok := principal.FromContext(ctx)
		if !ok {
			return results
		}

		l.reporter.TrackAsync(currentUser.OrganizationID, entitlementSlug)

		return results
	}
}

func anySucceeded[V any](results []*dataloader.Result[V]) bool {
	for _, result := range results {
		if result != nil && result.Error == nil {
			return true
		}
	}
	return false
}

// GetLoader retrieves a typed dataloader by name. It names the loader it could
// not find in the error, so a registration mistake reads as one.
func GetLoader[K comparable, V any](l *Loaders, name string) (*dataloader.Loader[K, V], error) {
	if l == nil {
		return nil, fmt.Errorf("%w: %s: no loaders in context", ErrLoaderNotRegistered, name)
	}
	loader, ok := l.loaders[name].(*dataloader.Loader[K, V])
	if !ok {
		return nil, fmt.Errorf("%w: %s", ErrLoaderNotRegistered, name)
	}
	return loader, nil
}

// ContextWithLoaders adds the loaders to the context.
func ContextWithLoaders(ctx context.Context, loaders *Loaders) context.Context {
	return context.WithValue(ctx, loadersKey, loaders)
}

// LoadersFromContext retrieves the loaders from context.
func LoadersFromContext(ctx context.Context) *Loaders {
	loaders, _ := ctx.Value(loadersKey).(*Loaders)
	return loaders
}
