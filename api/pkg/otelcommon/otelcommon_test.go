package otelcommon

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"
	"time"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

func TestNewOtelHandlerAddsTraceAndSpanIDs(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer
	logger := slog.New(NewOtelHandler(slog.NewTextHandler(&buf, nil)))

	tp := sdktrace.NewTracerProvider(sdktrace.WithSampler(sdktrace.AlwaysSample()))
	ctx, span := tp.Tracer("test").Start(context.Background(), "op")
	defer span.End()

	logger.InfoContext(ctx, "hello")

	out := buf.String()
	if !strings.Contains(out, "trace_id=") {
		t.Fatalf("expected trace_id in log output, got %q", out)
	}
	if !strings.Contains(out, "span_id=") {
		t.Fatalf("expected span_id in log output, got %q", out)
	}
}

// TestNewLoggerToWritesOnlyToTheGivenWriter is the guarantee kaiten-admin-tools
// depends on: its stdout carries a payload -- a table, or a credential and nothing
// else -- so every log line must go where it was told, and nowhere else.
func TestNewLoggerToWritesOnlyToTheGivenWriter(t *testing.T) {
	t.Parallel()

	for name, tc := range map[string]struct {
		level, format string
		log           func(*slog.Logger)
		want          string
		wantEmpty     bool
	}{
		"json format": {
			level: "info", format: "json",
			log:  func(l *slog.Logger) { l.Info("bootstrap complete", "file", "/credentials/platform-token") },
			want: `"msg":"bootstrap complete"`,
		},
		"text format": {
			level: "info", format: "TEXT",
			log:  func(l *slog.Logger) { l.Info("bootstrap complete") },
			want: `msg="bootstrap complete"`,
		},
		// Empty and unparseable both mean warn, so a CLI run with no LOG_LEVEL set
		// stays quiet instead of narrating itself over the operator's terminal.
		"default level drops info": {
			level: "", format: "json",
			log:       func(l *slog.Logger) { l.Info("chatter") },
			wantEmpty: true,
		},
		"unparseable level drops info": {
			level: "nonsense", format: "json",
			log:       func(l *slog.Logger) { l.Info("chatter") },
			wantEmpty: true,
		},
		"default level keeps warn": {
			level: "", format: "json",
			log:  func(l *slog.Logger) { l.Warn("refusing to overwrite an active credential") },
			want: `"level":"WARN"`,
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			var buf bytes.Buffer
			tc.log(NewLoggerTo(&buf, tc.level, tc.format))

			out := buf.String()
			switch {
			case tc.wantEmpty && out != "":
				t.Fatalf("expected nothing to be logged, got %q", out)
			case !tc.wantEmpty && !strings.Contains(out, tc.want):
				t.Fatalf("expected %q in log output, got %q", tc.want, out)
			}
		})
	}
}

func TestNewOtelHandlerSkipsInvalidSpanContext(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer
	logger := slog.New(NewOtelHandler(slog.NewTextHandler(&buf, nil)))
	logger.InfoContext(trace.ContextWithSpanContext(context.Background(), trace.SpanContext{}), "hello")

	out := buf.String()
	if strings.Contains(out, "trace_id=") || strings.Contains(out, "span_id=") {
		t.Fatalf("did not expect trace identifiers in log output, got %q", out)
	}
}

// fiberLikeCtx reproduces the shape that made request logs untraceable.
//
// It IS a context.Context, and looking a span up on it finds nothing -- exactly
// like fiber v3's Ctx, whose Value resolves against fasthttp user values rather
// than against the context otel.Middleware stored the span on. The real context
// is reachable only through Context().
type fiberLikeCtx struct {
	outer context.Context // span-free, like the Ctx itself
	inner context.Context // where the span actually lives
}

func (f fiberLikeCtx) Deadline() (time.Time, bool) { return f.outer.Deadline() }
func (f fiberLikeCtx) Done() <-chan struct{}       { return f.outer.Done() }
func (f fiberLikeCtx) Err() error                  { return f.outer.Err() }

// The whole point: a lookup on the Ctx resolves somewhere the span is not.
func (f fiberLikeCtx) Value(key any) any { return f.outer.Value(key) }

func (f fiberLikeCtx) Context() context.Context { return f.inner }

// The regression this fixes: slog-fiber logs every request with
// logger.LogAttrs(c, ...), handing the handler a fiber Ctx. Before the unwrap
// the handler looked the span up on the Ctx, found nothing, and emitted a
// request log with no trace id -- while application logs, which pass
// c.Context(), carried one. The busiest logs in the system were the ones that
// could not be tied to the request that produced them.
func TestOtelHandlerFindsTheSpanThroughAFiberStyleContext(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer
	logger := slog.New(NewOtelHandler(slog.NewTextHandler(&buf, nil)))

	tp := sdktrace.NewTracerProvider(sdktrace.WithSampler(sdktrace.AlwaysSample()))
	spanCtx, span := tp.Tracer("test").Start(context.Background(), "request")
	defer span.End()

	// What slog-fiber passes: a Ctx carrying no span, wrapping one that does.
	logger.InfoContext(fiberLikeCtx{outer: context.Background(), inner: spanCtx}, "Incoming request")

	out := buf.String()
	if sc := span.SpanContext(); !strings.Contains(out, sc.TraceID().String()) {
		t.Fatalf("a request log that cannot name its trace cannot be joined to it; got %q", out)
	}
	if sc := span.SpanContext(); !strings.Contains(out, sc.SpanID().String()) {
		t.Fatalf("expected span_id in output, got %q", out)
	}
}

// The ordinary path must keep working: a context holding the span directly is
// the majority of call sites, and unwrapping must not disturb it.
func TestOtelHandlerStillReadsAPlainContext(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer
	logger := slog.New(NewOtelHandler(slog.NewTextHandler(&buf, nil)))

	tp := sdktrace.NewTracerProvider(sdktrace.WithSampler(sdktrace.AlwaysSample()))
	spanCtx, span := tp.Tracer("test").Start(context.Background(), "direct")
	defer span.End()

	logger.InfoContext(spanCtx, "application line")

	if out := buf.String(); !strings.Contains(out, span.SpanContext().TraceID().String()) {
		t.Fatalf("expected trace_id from a plain context, got %q", out)
	}
}

// A carrier whose Context() is nil must not panic and must not lose the log.
// Cheap to get wrong, and it would take down every request that logs.
func TestOtelHandlerToleratesACarrierWithNoInnerContext(t *testing.T) {
	t.Parallel()

	var buf bytes.Buffer
	logger := slog.New(NewOtelHandler(slog.NewTextHandler(&buf, nil)))

	logger.InfoContext(fiberLikeCtx{outer: context.Background(), inner: nil}, "no inner")

	if out := buf.String(); !strings.Contains(out, "no inner") {
		t.Fatalf("the log was lost, got %q", out)
	}
}
