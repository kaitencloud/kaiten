// Package effectivelookup times the reads of instance_effective_entitlement
// (§19.1 entitlements_effective_lookup_duration_seconds), by reader: the view
// is on the report path and on KbK's critical path, so its latency is watched
// where each reader pays it.
package effectivelookup

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// Readers of the effective view, as the metric labels them.
const (
	ReaderGate    = "gate"
	ReaderREST    = "rest"
	ReaderGraphQL = "graphql"
	ReaderOFREP   = "ofrep"
)

var histogram = sync.OnceValue(func() metric.Float64Histogram {
	h, err := otel.GetMeterProvider().Meter("kaiten.entitlements").Float64Histogram("kaiten.entitlements.effective.lookup.duration",
		metric.WithDescription("How long a read of the effective entitlements took, by reader (gate, rest, graphql, ofrep)"),
		metric.WithUnit("s"), metric.WithExplicitBucketBoundaries(0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1))
	if err != nil {
		slog.Warn("failed to register the effective lookup metric", "error", err)
		return nil
	}
	return h
})

// Time starts timing one read for reader; call the function it returns when
// the read is done.
func Time(ctx context.Context, reader string) func() {
	started := time.Now()
	return func() {
		if h := histogram(); h != nil {
			h.Record(ctx, time.Since(started).Seconds(), metric.WithAttributes(attribute.String("reader", reader)))
		}
	}
}
