package closing

import (
	"context"
	"log/slog"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"
)

const meterName = "kaiten.billing.close"

// metrics are the period close's counters. A counter that failed to register
// is nil, and every method tolerates it: telemetry never fails a close.
type metrics struct {
	closed     metric.Int64Counter
	held       metric.Int64Counter
	failed     metric.Int64Counter
	released   metric.Int64Counter
	duplicates metric.Int64Counter
}

func newMetrics() *metrics {
	meter := otel.GetMeterProvider().Meter(meterName)
	counter := func(name, description, unit string) metric.Int64Counter {
		c, err := meter.Int64Counter(name, metric.WithDescription(description), metric.WithUnit(unit))
		if err != nil {
			slog.Warn("failed to register billing close metric", "metric", name, "error", err)
			return nil
		}
		return c
	}
	return &metrics{
		closed:     counter("kaiten.billing.close.invoices", "Invoices issued by a period close", "{invoice}"),
		held:       counter("kaiten.billing.close.held", "Period closes that produced a held invoice", "{invoice}"),
		failed:     counter("kaiten.billing.close.failures", "Subscriptions whose period close failed and was left for a later pass", "{subscription}"),
		released:   counter("kaiten.billing.close.released", "Held invoices released by a re-check", "{invoice}"),
		duplicates: counter("kaiten.billing.close.duplicate_suppressed", "Closes that lost the race for a boundary's invoice and issued nothing", "{close}"),
	}
}

func add(ctx context.Context, c metric.Int64Counter, n int64) {
	if c != nil && n > 0 {
		c.Add(ctx, n)
	}
}
