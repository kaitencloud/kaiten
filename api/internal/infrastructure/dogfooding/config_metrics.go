package dogfooding

import (
	"context"
	"log/slog"
	"sync"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"
)

// configMetrics are the CONFIG entitlement reads' (§18.4, §19.1):
// dogfooding_config_value_errors_total and _invalid_total, by slug.
var configMetrics = sync.OnceValue(func() [2]metric.Int64Counter {
	meter := otel.GetMeterProvider().Meter("kaiten.dogfooding")
	counter := func(name, description string) metric.Int64Counter {
		c, err := meter.Int64Counter(name, metric.WithDescription(description), metric.WithUnit("{read}"))
		if err != nil {
			slog.Warn("failed to register a dogfooding metric", "metric", name, "error", err)
			return nil
		}
		return c
	}
	return [2]metric.Int64Counter{
		counter("kaiten.dogfooding.config_value.errors",
			"CONFIG entitlement reads the licensing authority failed, by slug; the last known value stands when there is one"),
		counter("kaiten.dogfooding.config_value.invalid",
			"CONFIG entitlement values that are not what their reader expects, by slug; read as unknown"),
	}
})

// ConfigValueInvalid counts a CONFIG value of slug its reader could not use.
func ConfigValueInvalid(ctx context.Context, slug string) {
	if c := configMetrics()[1]; c != nil {
		c.Add(ctx, 1, metric.WithAttributes(attribute.String("slug", slug)))
	}
}

func configValueFailed(ctx context.Context, slug string) {
	if c := configMetrics()[0]; c != nil {
		c.Add(ctx, 1, metric.WithAttributes(attribute.String("slug", slug)))
	}
}
