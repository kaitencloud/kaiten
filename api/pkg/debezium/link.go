package debezium

import (
	"context"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// brokerHeaderPrefix is how the broker's own message headers reach a Dapr
// subscriber. The RabbitMQ component, with publishMessagePropertiesToMetadata
// on, hands every AMQP header over as metadata.<key>, and the sidecar forwards
// metadata as HTTP request headers.
const brokerHeaderPrefix = "metadata."

// PublishLink returns a span link to the span that published a delivery to
// RabbitMQ, read from the broker headers of the delivery; header looks one up
// by request header name, and destination is the exchange the subscriber reads.
//
// That span belongs to a trace of its own. The event's trace runs from the
// request to the outbox, then from the sidecar to the subscriber, through the
// traceparent in the CloudEvent envelope, while Debezium's OpenTelemetry agent
// starts every publish to RabbitMQ from an empty context and writes that
// span's traceparent into the AMQP headers. A link is how the event's trace
// still references the publish, with its exchange and its broker address.
//
// ok is false without a usable traceparent in those headers: the agent off, or
// only Debezium's record header, which its sink serialises as a JSON document.
func PublishLink(header func(name string) string, destination string) (link trace.Link, ok bool) {
	carrier := propagation.MapCarrier{
		"traceparent": header(brokerHeaderPrefix + "traceparent"),
		"tracestate":  header(brokerHeaderPrefix + "tracestate"),
	}
	publisher := trace.SpanContextFromContext(propagation.TraceContext{}.Extract(context.Background(), carrier))
	if !publisher.IsValid() {
		return trace.Link{}, false
	}

	return trace.Link{
		SpanContext: publisher,
		Attributes: []attribute.KeyValue{
			attribute.String("messaging.system", "rabbitmq"),
			attribute.String("messaging.operation.type", "send"),
			attribute.String("messaging.destination.name", destination),
		},
	}, true
}
