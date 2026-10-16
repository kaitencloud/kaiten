package debezium

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/attribute"
)

// Debezium's OpenTelemetry agent writes this into the AMQP headers: its publish
// span, with the W3C random flag set next to sampled.
const publishTraceparent = "00-fb272e8a50f21fb0933833c0a8369841-4e9fb7b3c86c5724-03"

func headers(values map[string]string) func(string) string {
	return func(name string) string { return values[name] }
}

func TestPublishLinkReadsTheBrokerTraceparent(t *testing.T) {
	link, ok := PublishLink(headers(map[string]string{"metadata.traceparent": publishTraceparent}), "kaiten.events")

	require.True(t, ok)
	assert.Equal(t, "fb272e8a50f21fb0933833c0a8369841", link.SpanContext.TraceID().String())
	assert.Equal(t, "4e9fb7b3c86c5724", link.SpanContext.SpanID().String())
	assert.True(t, link.SpanContext.IsSampled())
	assert.Contains(t, link.Attributes, attribute.String("messaging.system", "rabbitmq"))
	assert.Contains(t, link.Attributes, attribute.String("messaging.destination.name", "kaiten.events"))
}

// Without the agent there is no traceparent of its own in the AMQP headers, or
// only Debezium's record header, which the sink writes as a JSON document. Either
// way there is nothing to link, and nothing must fail.
func TestPublishLinkWithoutAUsableTraceparent(t *testing.T) {
	for name, values := range map[string]map[string]string{
		"no broker headers": {},
		"a JSON-wrapped record header": {
			"metadata.traceparent": `{"schema":{"type":"string"},"payload":"` + publishTraceparent + `"}`,
		},
		"the bare traceparent, not a broker header": {"traceparent": publishTraceparent},
	} {
		t.Run(name, func(t *testing.T) {
			_, ok := PublishLink(headers(values), "kaiten.events")
			assert.False(t, ok)
		})
	}
}
