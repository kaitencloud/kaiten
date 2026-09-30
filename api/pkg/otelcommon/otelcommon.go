package otelcommon

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.27.0"
	"go.opentelemetry.io/otel/trace"
	"go.opentelemetry.io/otel/trace/noop"
)

// Config holds common OTEL exporter and resource settings.
type Config struct {
	Enabled bool
	// Endpoint receives traces.
	Endpoint string
	// MetricsEndpoint receives metrics. Empty means metrics are not
	// exported: Endpoint is deliberately not reused for them, because it
	// points at Jaeger in every environment we run today and Jaeger serves
	// /v1/traces only.
	MetricsEndpoint string
	ServiceName     string
	Insecure        bool
	Authorization   string
	// SamplingRatio is the head sampling probability, clamped to [0,1] and
	// applied only to traces with no sampled parent.
	SamplingRatio float64
}

var (
	tracerProvider *sdktrace.TracerProvider
	meterProvider  *sdkmetric.MeterProvider
)

// InitTracer configures the global OTEL tracer and meter providers, and says
// at startup which signals it ended up exporting and where. A process that
// silently exports nothing is indistinguishable from a healthy one at the log
// level, which is how telemetry stayed off unnoticed.
func InitTracer(ctx context.Context, cfg Config) error {
	// Installed whether or not this process exports anything: propagation
	// costs nothing on its own, and it is what keeps an inbound traceparent
	// (from Envoy, or from another service) attached to the context so
	// outbound calls and outbox events carry the caller's trace forward
	// even when this process is not recording it.
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	if !cfg.Enabled {
		otel.SetTracerProvider(noop.NewTracerProvider())
		tracerProvider = nil
		meterProvider = nil
		slog.WarnContext(ctx, "telemetry is disabled: no traces or metrics will be exported",
			slog.String("service", cfg.ServiceName),
			slog.String("enable_with", "OTEL_ENABLED=true"))
		return nil
	}

	res, err := resource.New(
		ctx,
		resource.WithAttributes(semconv.ServiceName(cfg.ServiceName)),
		resource.WithTelemetrySDK(),
		resource.WithHost(),
		resource.WithProcessRuntimeName(),
		resource.WithProcessRuntimeVersion(),
	)
	if err != nil {
		return fmt.Errorf("failed to create resource: %w", err)
	}

	traceOpts := []otlptracehttp.Option{otlptracehttp.WithEndpoint(cfg.Endpoint)}
	if cfg.Insecure {
		traceOpts = append(traceOpts, otlptracehttp.WithInsecure())
	}
	if cfg.Authorization != "" {
		traceOpts = append(traceOpts, otlptracehttp.WithHeaders(map[string]string{
			"Authorization": cfg.Authorization,
		}))
	}
	traceExporter, err := otlptracehttp.New(ctx, traceOpts...)
	if err != nil {
		return fmt.Errorf("failed to create OTLP trace exporter: %w", err)
	}

	ratio := clampRatio(cfg.SamplingRatio)
	tracerProvider = sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter),
		sdktrace.WithResource(res),
		// ParentBased so a decision taken upstream (Envoy, or the request
		// that produced an outbox event) is honoured rather than re-rolled
		// halfway through a trace.
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.TraceIDRatioBased(ratio))),
	)
	otel.SetTracerProvider(tracerProvider)

	slog.InfoContext(ctx, "telemetry enabled",
		slog.String("service", cfg.ServiceName),
		slog.String("traces_endpoint", cfg.Endpoint),
		slog.Float64("sampling_ratio", ratio))

	// No metrics endpoint means no meter provider at all -- the global one
	// stays a noop and the instruments registered against it cost nothing.
	// The alternative, pointing the PeriodicReader at the trace endpoint,
	// is what used to POST every collection cycle at Jaeger and discard the
	// failure.
	if cfg.MetricsEndpoint == "" {
		slog.WarnContext(ctx, "telemetry metrics are not exported: OTEL_METRICS_ENDPOINT is unset",
			slog.String("hint", "point it at a collector that accepts OTLP metrics; the trace endpoint is not reused because Jaeger serves /v1/traces only"))
		return nil
	}

	metricOpts := []otlpmetrichttp.Option{otlpmetrichttp.WithEndpoint(cfg.MetricsEndpoint)}
	if cfg.Insecure {
		metricOpts = append(metricOpts, otlpmetrichttp.WithInsecure())
	}
	if cfg.Authorization != "" {
		metricOpts = append(metricOpts, otlpmetrichttp.WithHeaders(map[string]string{
			"Authorization": cfg.Authorization,
		}))
	}
	metricExporter, err := otlpmetrichttp.New(ctx, metricOpts...)
	if err != nil {
		return fmt.Errorf("failed to create OTLP metric exporter: %w", err)
	}

	meterProvider = sdkmetric.NewMeterProvider(
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(metricExporter)),
		sdkmetric.WithResource(res),
	)
	otel.SetMeterProvider(meterProvider)

	slog.InfoContext(ctx, "telemetry metrics enabled",
		slog.String("metrics_endpoint", cfg.MetricsEndpoint))

	return nil
}

// clampRatio keeps a configured sampling ratio inside the [0,1] the SDK
// expects. 0 samples nothing, 1 samples every trace.
func clampRatio(ratio float64) float64 {
	if ratio < 0 {
		return 0
	}
	if ratio > 1 {
		return 1
	}
	return ratio
}

// Shutdown flushes and closes the active tracer and meter providers.
func Shutdown(ctx context.Context) error {
	var traceErr, metricErr error
	if tracerProvider != nil {
		traceErr = tracerProvider.Shutdown(ctx)
	}
	if meterProvider != nil {
		metricErr = meterProvider.Shutdown(ctx)
	}
	if traceErr != nil {
		return traceErr
	}
	return metricErr
}

// NewLogger builds a slog logger with trace/span enrichment, writing to stdout.
//
// Stdout is right for a long-running service, whose stdout *is* its log stream in
// every environment we run (compose, Kubernetes). It is wrong for a CLI whose
// stdout is a payload -- see NewLoggerTo.
func NewLogger(levelText, format string) *slog.Logger {
	return NewLoggerTo(os.Stdout, levelText, format)
}

// NewLoggerTo is NewLogger writing to w.
//
// It exists for the commands that emit a value on stdout, where a log line is not
// noise but corruption: kaiten-admin-tools' credential commands print a secret and
// nothing else, so that `TOKEN="$(kaiten-admin-tools platform-token create ...)"`
// assigns a usable credential rather than a token with a JSON log record stapled to
// it. Those binaries pass os.Stderr, which is also where a CLI's diagnostics belong
// regardless of this feature.
//
// Writing a secret to stdout is safe only because nothing else goes there. That is
// the invariant this function exists to make possible, and cmd/admin-tools tests it
// by asserting stdout contains exactly the token.
func NewLoggerTo(w io.Writer, levelText, format string) *slog.Logger {
	levelText = strings.TrimSpace(levelText)
	if levelText == "" {
		levelText = "warn"
	}

	var level slog.Level
	if err := level.UnmarshalText([]byte(levelText)); err != nil {
		level = slog.LevelWarn
	}

	options := &slog.HandlerOptions{Level: level}
	var base slog.Handler
	if strings.EqualFold(strings.TrimSpace(format), "text") {
		base = slog.NewTextHandler(w, options)
	} else {
		base = slog.NewJSONHandler(w, options)
	}

	return slog.New(NewOtelHandler(base))
}

// NewOtelHandler wraps base and injects trace/span identifiers from the active OTEL span.
func NewOtelHandler(base slog.Handler) slog.Handler {
	return &otelHandler{base: base}
}

type otelHandler struct {
	base slog.Handler
}

func (h *otelHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.base.Enabled(ctx, level)
}

// contextCarrier is anything that hands back a real context.Context.
//
// fiber.Ctx is the one that matters, and the reason this exists. A fiber v3 Ctx
// IS a context.Context, so middleware passes it around as one -- but its Value
// resolves against fasthttp's user values, NOT against the context that
// otel.Middleware stored the span on with SetContext. Look a span up on the Ctx
// itself and there is never one there.
//
// That is why kaiten's request logs carried no trace ids while its application
// logs did: slog-fiber calls logger.LogAttrs(c, ...) with the Ctx, application
// code calls slog.InfoContext(c.Context(), ...) with the real thing. Same
// handler, same span, two different answers. slog-fiber's WithTraceID option is
// on and cannot work for the same reason -- it makes the identical lookup.
//
// An interface rather than importing fiber, so this package stays free of a web
// framework for the sake of one method.
type contextCarrier interface {
	Context() context.Context
}

// unwrapContext returns the context a span can actually be found on.
//
// One level only: the shapes this exists for nest exactly once, and following
// further would be guessing at a structure nobody has described.
func unwrapContext(ctx context.Context) context.Context {
	carrier, ok := ctx.(contextCarrier)
	if !ok {
		return ctx
	}

	inner := carrier.Context()
	if inner == nil {
		return ctx
	}

	return inner
}

func (h *otelHandler) Handle(ctx context.Context, record slog.Record) error {
	span := trace.SpanFromContext(unwrapContext(ctx))
	if span.IsRecording() {
		sc := span.SpanContext()
		if sc.HasTraceID() {
			record.AddAttrs(slog.String("trace_id", sc.TraceID().String()))
		}
		if sc.HasSpanID() {
			record.AddAttrs(slog.String("span_id", sc.SpanID().String()))
		}
	}
	return h.base.Handle(ctx, record)
}

func (h *otelHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &otelHandler{base: h.base.WithAttrs(attrs)}
}

func (h *otelHandler) WithGroup(name string) slog.Handler {
	return &otelHandler{base: h.base.WithGroup(name)}
}
