package dataloader

import (
	"context"
	"testing"

	dataloaderLib "github.com/graph-gophers/dataloader/v7"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubLoader is never loaded from: these tests only care about what the
// lookup returns, not about what a batch function would do.
func stubLoader[K comparable, V any]() *dataloaderLib.Loader[K, V] {
	return dataloaderLib.NewBatchedLoader(func(context.Context, []K) []*dataloaderLib.Result[V] {
		return nil
	})
}

// TestGetLoaderReportsAnAbsentLoaderAsAWiringBug pins the contract the
// resolvers depend on: a loader that is not in the container is a
// registration mistake and says so, naming the loader, rather than a nil the
// call site turns into an authentication failure the client never caused.
func TestGetLoaderReportsAnAbsentLoaderAsAWiringBug(t *testing.T) {
	registered := NewLoaders(nil)
	registered.Register("PresentLoader", stubLoader[string, int]())

	tests := []struct {
		name    string
		loaders *Loaders
		lookup  string
	}{
		{name: "NoLoadersInContext", loaders: nil, lookup: "PresentLoader"},
		{name: "NameNeverRegistered", loaders: registered, lookup: "AbsentLoader"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			loader, err := GetLoader[string, int](tt.loaders, tt.lookup)

			require.Nil(t, loader)
			require.ErrorIs(t, err, ErrLoaderNotRegistered)
			assert.NotErrorIs(t, err, ErrMissingIdentity)
			assert.Contains(t, err.Error(), tt.lookup, "the error should name the loader it could not find")
		})
	}
}

// TestGetLoaderRejectsATypeMismatch covers the second way the lookup used to
// return a silent nil: the name is registered, but under different key or
// value types than the caller asks for.
func TestGetLoaderRejectsATypeMismatch(t *testing.T) {
	loaders := NewLoaders(nil)
	loaders.Register("PresentLoader", stubLoader[string, int]())

	loader, err := GetLoader[string, bool](loaders, "PresentLoader")

	require.Nil(t, loader)
	require.ErrorIs(t, err, ErrLoaderNotRegistered)
	assert.NotErrorIs(t, err, ErrMissingIdentity)
}

// TestGetLoaderReturnsTheRegisteredLoader is the happy path: the container
// hands back the very loader that was registered, not a copy.
func TestGetLoaderReturnsTheRegisteredLoader(t *testing.T) {
	loaders := NewLoaders(nil)
	registered := stubLoader[string, int]()
	loaders.Register("PresentLoader", registered)

	loader, err := GetLoader[string, int](loaders, "PresentLoader")

	require.NoError(t, err)
	assert.Same(t, registered, loader)
}
