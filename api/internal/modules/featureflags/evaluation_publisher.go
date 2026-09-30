package featureflags

import (
	"context"
	"log/slog"
	"sync"

	"github.com/danielgtaylor/huma/v2"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events/webhook"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/openfeature"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	ffevents "github.com/kaitencloud/kaiten/api/internal/modules/featureflags/events"
)

const publisherMeter = "kaiten.featureflags.evaluation"

// evaluationPublisher drains FlagEvaluationAudit events from a bounded channel and
// writes them to the outbox table using the generic outbox API.
//
// Publish is non-blocking: if the internal buffer is full the event is dropped
// and a warning is logged, so the feature flag API path is never blocked.
type evaluationPublisher struct {
	outboxRepo outbox.Repository
	ch         chan ffevents.FlagEvaluationAudit
	wg         sync.WaitGroup

	eventsPublished metric.Int64Counter
	eventsDropped   metric.Int64Counter
	eventsWritten   metric.Int64Counter
	writeErrors     metric.Int64Counter
}

func newEvaluationPublisher(outboxRepo outbox.Repository, bufferSize int) *evaluationPublisher {
	p := &evaluationPublisher{
		outboxRepo: outboxRepo,
		ch:         make(chan ffevents.FlagEvaluationAudit, bufferSize),
	}
	p.initMetrics()
	return p
}

func (p *evaluationPublisher) initMetrics() {
	m := otel.GetMeterProvider().Meter(publisherMeter)

	p.eventsPublished = registerCounter(
		m,
		"kaiten.featureflags.evaluation.events.published",
		"Total evaluation events accepted into the audit buffer",
		"{event}",
	)
	p.eventsDropped = registerCounter(
		m,
		"kaiten.featureflags.evaluation.events.dropped",
		"Total evaluation events dropped because the audit buffer was full",
		"{event}",
	)
	p.eventsWritten = registerCounter(
		m,
		"kaiten.featureflags.evaluation.events.written",
		"Total evaluation events successfully written to the outbox table",
		"{event}",
	)
	p.writeErrors = registerCounter(
		m,
		"kaiten.featureflags.evaluation.write.errors",
		"Total outbox write failures for evaluation events",
		"{error}",
	)

	// Observable gauges — sampled by the SDK on each collection cycle.
	if _, err := m.Int64ObservableGauge(
		"kaiten.featureflags.evaluation.buffer.used",
		metric.WithDescription("Current number of events waiting in the audit buffer"),
		metric.WithUnit("{event}"),
		metric.WithInt64Callback(func(_ context.Context, o metric.Int64Observer) error {
			o.Observe(int64(len(p.ch)))
			return nil
		}),
	); err != nil {
		slog.Warn("failed to register evaluation publisher metric", "metric", "buffer.used", "error", err)
	}

	if _, err := m.Float64ObservableGauge(
		"kaiten.featureflags.evaluation.buffer.utilization",
		metric.WithDescription("Audit buffer fill ratio (0–1). Alert when this exceeds 0.75."),
		metric.WithUnit("1"),
		metric.WithFloat64Callback(func(_ context.Context, o metric.Float64Observer) error {
			o.Observe(float64(len(p.ch)) / float64(cap(p.ch)))
			return nil
		}),
	); err != nil {
		slog.Warn("failed to register evaluation publisher metric", "metric", "buffer.utilization", "error", err)
	}
}

func registerCounter(m metric.Meter, name, desc, unit string) metric.Int64Counter {
	c, err := m.Int64Counter(name, metric.WithDescription(desc), metric.WithUnit(unit))
	if err != nil {
		slog.Warn("failed to register evaluation publisher metric", "metric", name, "error", err)
	}
	return c
}

// start launches n background worker goroutines. Call stop to drain on shutdown.
func (p *evaluationPublisher) start(workers int) {
	for range workers {
		p.wg.Add(1)
		go func() {
			defer p.wg.Done()
			for event := range p.ch {
				p.writeToOutbox(event)
			}
		}()
	}
}

// stop closes the channel and waits for workers to drain remaining events.
func (p *evaluationPublisher) stop() {
	close(p.ch)
	p.wg.Wait()
}

// Publish implements ffevents.EvaluationPublisher.
func (p *evaluationPublisher) Publish(event ffevents.FlagEvaluationAudit) {
	select {
	case p.ch <- event:
		p.eventsPublished.Add(context.Background(), 1)
	default:
		p.eventsDropped.Add(context.Background(), 1)
		slog.Warn(
			"evaluation audit publisher buffer full, event dropped",
			"flag_slug", event.FlagSlug,
			"organization_id", event.OrganizationID,
		)
	}
}

// FeatureFlagEvaluated is the outbox payload for FEATURE_FLAG_EVALUATED. It
// deliberately carries no evaluation context (see
// ffevents.FlagEvaluationAudit), so no PII reaches the audit trail or a
// webhook subscriber.
type FeatureFlagEvaluated struct {
	FlagSlug        string                 `json:"flag_slug" doc:"URL-friendly identifier of the evaluated flag"`
	FlagID          string                 `json:"flag_id" doc:"Unique identifier of the evaluated flag"`
	Variant         *string                `json:"variant,omitempty" doc:"Name of the resolved variant, when the flag has one"`
	Reason          openfeature.Reason     `json:"reason" doc:"Why the value resolved as it did"`
	ErrorCode       *openfeature.ErrorCode `json:"error_code,omitempty" doc:"Set when the evaluation failed and the default was returned"`
	ErrorMessage    *string                `json:"error_message,omitempty" doc:"Human-readable detail accompanying error_code"`
	MatchedRuleName *string                `json:"matched_rule_name,omitempty" doc:"Name of the targeting rule that matched, when the reason is TARGETING_MATCH"`
}

func (p *evaluationPublisher) writeToOutbox(event ffevents.FlagEvaluationAudit) {
	rd := event.ResolutionDetails
	ev := ffevents.FeatureFlagEvaluated
	msg := outbox.NewOutboxMessage(
		event.OrganizationID,
		ev.Name,
		ev.Type,
		FeatureFlagEvaluated{
			FlagSlug:        event.FlagSlug,
			FlagID:          event.FlagID.String(),
			Variant:         rd.Variant,
			Reason:          *rd.Reason,
			ErrorCode:       rd.ErrorCode,
			ErrorMessage:    rd.ErrorMessage,
			MatchedRuleName: rd.MatchedRuleName,
		},
		nil,
	)

	if err := p.outboxRepo.CreateOutboxEvent(context.Background(), msg); err != nil {
		p.writeErrors.Add(context.Background(), 1)
		slog.Error(
			"failed to write evaluation event to outbox",
			"flag_slug", event.FlagSlug,
			"organization_id", event.OrganizationID,
			"error", err,
		)
		return
	}
	p.eventsWritten.Add(context.Background(), 1)
}

// RegisterWebhook declares the FeatureFlagEvaluated webhook contract in the
// OpenAPI document. It lives here rather than in a use-case package because
// the event is emitted by the publisher above, not by an endpoint.
func RegisterWebhook(api huma.API) {
	webhook.Declare(api, webhook.Declaration{
		Event:       ffevents.FeatureFlagEvaluated,
		Data:        (*FeatureFlagEvaluated)(nil),
		OperationID: "onFeatureFlagEvaluated",
		Summary:     "Feature Flag Evaluated Webhook",
		Description: "Triggered on every flag evaluation. The payload carries no evaluation context, so no targeting key or user attribute is exposed.",
		Tags:        []string{"webhooks", "featureflags"},
	})
}
