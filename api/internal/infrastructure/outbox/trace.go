package outbox

import (
	"context"
	"encoding/json"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"

	"github.com/kaitencloud/kaiten/api/pkg/debezium"
)

// marshalHeaders serialises an event's headers and merges the W3C trace
// context of ctx into them. The trace keys (traceparent, plus tracestate and
// baggage when something upstream set them) sit alongside the caller's own
// fields -- AuditHeaders' instance_id and whatever else a producer adds -- in
// the same flat JSON object, because that is the shape the headers column
// already has and the shape Debezium hands the consumer.
//
// This is what lets a consumer reading the row off the CDC stream continue
// the trace that produced it. Doing it here rather than at the ~56 call sites
// means every producer gets it, including ones written after this.
//
// Returns nil when there is neither a header payload nor a trace context, so
// events published outside a span keep writing SQL NULL as before.
func marshalHeaders(ctx context.Context, headers any) ([]byte, error) {
	carrier := propagation.MapCarrier{}
	otel.GetTextMapPropagator().Inject(ctx, carrier)

	if headers == nil {
		if len(carrier) == 0 {
			return nil, nil
		}
		return json.Marshal(carrier)
	}

	raw, err := json.Marshal(headers)
	if err != nil {
		return nil, err
	}
	if len(carrier) == 0 {
		return raw, nil
	}

	// Merging happens on the marshalled form because Headers is `any`: the
	// producer's type is unknown here, only its JSON shape is.
	merged := map[string]json.RawMessage{}
	if err := json.Unmarshal(raw, &merged); err != nil {
		// A headers payload that is not a JSON object has nowhere to put the
		// trace keys. Publishing it untraced beats failing the caller's write.
		return raw, nil
	}
	for key, value := range carrier {
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		merged[key] = encoded
	}

	return json.Marshal(merged)
}

// ContextWithTrace returns ctx continued from the trace context that
// marshalHeaders recorded in an outbox event's headers. A consumer calls it
// before starting its own span, so that span joins the trace of the request
// that produced the event instead of rooting a new one -- without it the
// causal chain stops dead at the outbox, which is where most of this
// platform's work actually happens.
//
// raw is the headers column as Debezium delivers it: a JSON object, or a
// double-encoded JSON string. ctx comes back unchanged when it carries no
// trace context.
func ContextWithTrace(ctx context.Context, raw json.RawMessage) context.Context {
	if len(raw) == 0 {
		return ctx
	}

	var decoded map[string]json.RawMessage
	if err := debezium.UnmarshalHeaders(raw, &decoded); err != nil {
		return ctx
	}

	// Only string-valued entries can be carrier values; a producer's own
	// non-string header must not cost us the traceparent next to it.
	carrier := propagation.MapCarrier{}
	for key, value := range decoded {
		var text string
		if err := json.Unmarshal(value, &text); err == nil {
			carrier[key] = text
		}
	}
	if len(carrier) == 0 {
		return ctx
	}

	return otel.GetTextMapPropagator().Extract(ctx, carrier)
}
