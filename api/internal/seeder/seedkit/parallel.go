package seedkit

import (
	"context"

	"golang.org/x/sync/errgroup"
)

// DefaultWorkers is the standard bounded-concurrency limit used by the seeder.
// Sized so 4 parallel orgs stay within the seeder's 150-connection pool.
const DefaultWorkers = 35

// ForEach runs fn over items with at most `limit` concurrent goroutines, using
// an errgroup so the first error cancels the rest. The index lets callers write
// into a preallocated result slice slot without a mutex. Non-positive limits
// use DefaultWorkers so callers can never accidentally spawn unbounded work.
func ForEach[T any](ctx context.Context, limit int, items []T, fn func(ctx context.Context, i int, item T) error) error {
	eg, egCtx := errgroup.WithContext(ctx)
	if limit <= 0 {
		limit = DefaultWorkers
	}
	eg.SetLimit(limit)
	for i, item := range items {
		eg.Go(func() error {
			return fn(egCtx, i, item)
		})
	}
	return eg.Wait()
}
