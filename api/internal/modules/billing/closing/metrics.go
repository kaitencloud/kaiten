package closing

import (
	"context"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/telemetry"
)

const meterName = "kaiten.billing.close"

// Results of a composed invoice, as billing_invoices_composed_total labels
// them.
const (
	resultIssued    = "issued"
	resultHeld      = "held"
	resultZeroTotal = "zero_total"
)

// metrics are the period close's (§19.1). An instrument that failed to
// register is nil, and every method tolerates it: telemetry never fails a
// close.
type metrics struct {
	composed metric.Int64Counter
	held     metric.Int64Counter
	released metric.Int64Counter
	duration metric.Float64Histogram
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
	duration, err := meter.Float64Histogram("kaiten.billing.period_close.duration",
		metric.WithDescription("How long closing one subscription's period took, by the kind of invoice it issued"), metric.WithUnit("s"))
	if err != nil {
		slog.Warn("failed to register billing close metric", "metric", "kaiten.billing.period_close.duration", "error", err)
		duration = nil
	}
	return &metrics{
		composed: counter("kaiten.billing.invoices.composed",
			"Invoices a period close composed, by kind, provider and result (issued, held, zero_total)", "{invoice}"),
		held: counter("kaiten.billing.invoice.hold",
			"Invoices held because their usage journal failed a check, by reason", "{invoice}"),
		released: counter("kaiten.billing.close.released", "Held invoices released by a re-check", "{invoice}"),
		duration: duration,
	}
}

func add(ctx context.Context, c metric.Int64Counter, n int64) {
	if c != nil && n > 0 {
		c.Add(ctx, n)
	}
}

// closed records an invoice a close composed, and how long the close took.
func (m *metrics) closed(ctx context.Context, invoice ClosedInvoice, took time.Duration) {
	result := resultIssued
	switch {
	case invoice.Held:
		result = resultHeld
	case invoice.Status == "PAID":
		// Only a zero total is paid at composition.
		result = resultZeroTotal
	}
	kind := attribute.String("kind", invoice.Kind)
	if m.composed != nil {
		m.composed.Add(ctx, 1, metric.WithAttributes(kind, attribute.String("provider", invoice.provider), attribute.String("result", result)))
	}
	if invoice.Held && m.held != nil {
		m.held.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", invoice.holdReason)))
	}
	if m.duration != nil {
		m.duration.Record(ctx, took.Seconds(), metric.WithAttributes(kind))
	}
}

// failed records a subscription the close failed on.
func (m *metrics) failed(ctx context.Context, panicked bool) {
	telemetry.ItemFailed(ctx, telemetry.JobPeriodClose, panicked)
}
