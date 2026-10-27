// Package telemetry is the anonymous checkout's metrics (§19.1, V32-01): the
// Turnstile verifications, the sessions by the status they enter, the time
// from a start to its completion, and the completions that failed after a
// setup.
//
// A metric that fails to register is nil and every recorder tolerates it:
// telemetry never fails a checkout.
package telemetry

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Outcomes of a Turnstile verification.
const (
	TurnstileSuccess     = "success"
	TurnstileFailed      = "failed"
	TurnstileUnavailable = "unavailable"
)

type instruments struct {
	turnstile      metric.Int64Counter
	sessions       metric.Int64Counter
	timeToComplete metric.Float64Histogram
	failures       metric.Int64Counter
}

var get = sync.OnceValue(func() *instruments {
	public := otel.GetMeterProvider().Meter("kaiten.public")
	billing := otel.GetMeterProvider().Meter("kaiten.billing")
	counter := func(meter metric.Meter, name, description, unit string) metric.Int64Counter {
		c, err := meter.Int64Counter(name, metric.WithDescription(description), metric.WithUnit(unit))
		if err != nil {
			slog.Warn("failed to register a checkout metric", "metric", name, "error", err)
			return nil
		}
		return c
	}
	h, err := public.Float64Histogram("kaiten.public.checkout_sessions.time_to_complete",
		metric.WithDescription("Time from an anonymous checkout's start to its completion, payment included"), metric.WithUnit("s"))
	if err != nil {
		slog.Warn("failed to register a checkout metric", "metric", "kaiten.public.checkout_sessions.time_to_complete", "error", err)
		h = nil
	}
	return &instruments{
		turnstile: counter(public, "kaiten.public.turnstile.verifications",
			"Turnstile verifications of anonymous checkout starts, dryRun included, by outcome (success, failed, unavailable)", "{verification}"),
		sessions: counter(public, "kaiten.public.checkout_sessions",
			"Anonymous checkout sessions, each time one enters a status", "{session}"),
		timeToComplete: h,
		failures: counter(billing, "kaiten.billing.checkout.completion_failures",
			"Anonymous checkout completions that failed after a successful setup, by reason (transient, refused)", "{completion}"),
	}
})

// TurnstileVerified counts one verification.
func TurnstileVerified(ctx context.Context, outcome string) {
	if c := get().turnstile; c != nil {
		c.Add(ctx, 1, metric.WithAttributes(attribute.String("outcome", outcome)))
	}
}

// SessionEntered counts a session entering status (OPEN, AWAITING_PAYMENT,
// ABANDONED, EXPIRED); Completed counts COMPLETED.
func SessionEntered(ctx context.Context, status string) {
	if c := get().sessions; c != nil {
		c.Add(ctx, 1, metric.WithAttributes(attribute.String("status", status)))
	}
}

// Completed counts a session COMPLETED, and the time since its start.
func Completed(ctx context.Context, startedAt, completedAt time.Time) {
	SessionEntered(ctx, "COMPLETED")
	if h := get().timeToComplete; h != nil && !startedAt.IsZero() {
		h.Record(ctx, completedAt.Sub(startedAt).Seconds())
	}
}

// CompletionFailed counts a completion that failed after a successful setup:
// refused when the API refused it (an archived price, a quota), transient
// otherwise (a database or provider failure).
func CompletionFailed(ctx context.Context, err error) {
	reason := "transient"
	if status := kaitenerrors.GetHTTPStatus(err); status >= 400 && status < 500 {
		reason = "refused"
	}
	if c := get().failures; c != nil {
		c.Add(ctx, 1, metric.WithAttributes(attribute.String("reason", reason)))
	}
}
