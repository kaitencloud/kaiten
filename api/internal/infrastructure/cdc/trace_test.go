package cdc

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/trace"
)

const publishTraceparent = "00-fb272e8a50f21fb0933833c0a8369841-4e9fb7b3c86c5724-03"

func brokerHeaders(name string) string {
	if name == "metadata.traceparent" {
		return publishTraceparent
	}
	return ""
}

func TestContextWithPublisherRecordsTheLink(t *testing.T) {
	links := publisherLinks(ContextWithPublisher(context.Background(), brokerHeaders))

	require.Len(t, links, 1)
	assert.Equal(t, "4e9fb7b3c86c5724", links[0].SpanContext.SpanID().String())
}

func TestContextWithPublisherWithoutBrokerHeaders(t *testing.T) {
	ctx := ContextWithPublisher(context.Background(), func(string) string { return "" })
	assert.Empty(t, publisherLinks(ctx))
}

// A publisher in the consumer's own trace is already its ancestor; linking it
// again would only duplicate the parent chain.
func TestPublisherLinksSkipsTheConsumersOwnTrace(t *testing.T) {
	ctx := ContextWithPublisher(context.Background(), brokerHeaders)
	link, ok := ctx.Value(publisherKey{}).(trace.Link)
	require.True(t, ok)

	own := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    link.SpanContext.TraceID(),
		SpanID:     trace.SpanID{0x01},
		TraceFlags: trace.FlagsSampled,
	})

	assert.Empty(t, publisherLinks(trace.ContextWithSpanContext(ctx, own)))
}
