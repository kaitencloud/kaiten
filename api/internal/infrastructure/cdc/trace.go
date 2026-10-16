package cdc

import (
	"context"

	"go.opentelemetry.io/otel/trace"

	"github.com/kaitencloud/kaiten/api/pkg/debezium"
)

// messagingSystem is the broker behind PubsubName, for the OpenTelemetry
// messaging attributes. The sidecar's own span says "pubsub" whatever the
// broker is.
const messagingSystem = "rabbitmq"

type publisherKey struct{}

// ContextWithPublisher records the span that published a delivery to the
// broker, read from the broker headers the sidecar forwards; header looks one
// up by request header name. consume links each consumer's span to it. See
// debezium.PublishLink for why that span sits in a trace of its own, and when
// there is none to record.
func ContextWithPublisher(ctx context.Context, header func(name string) string) context.Context {
	link, ok := debezium.PublishLink(header, Topic)
	if !ok {
		return ctx
	}
	return context.WithValue(ctx, publisherKey{}, link)
}

// publisherLinks returns the link ContextWithPublisher recorded, unless its
// span is already in ctx's trace: a link to one's own trace says nothing the
// parent chain does not.
func publisherLinks(ctx context.Context) []trace.Link {
	link, ok := ctx.Value(publisherKey{}).(trace.Link)
	if !ok || link.SpanContext.TraceID() == trace.SpanContextFromContext(ctx).TraceID() {
		return nil
	}
	return []trace.Link{link}
}
