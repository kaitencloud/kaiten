package outbox

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/trace"
)

// The propagator is a process global that InitTracer installs at startup;
// these tests exercise the header format, so they need it installed too.
func TestMain(m *testing.M) {
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))
	m.Run()
}

// contextWithSpan returns a context carrying a valid, sampled span context,
// standing in for the span a real producer publishes inside.
func contextWithSpan(t *testing.T) (context.Context, trace.SpanContext) {
	t.Helper()

	sc := trace.NewSpanContext(trace.SpanContextConfig{
		TraceID:    trace.TraceID{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10},
		SpanID:     trace.SpanID{0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18},
		TraceFlags: trace.FlagsSampled,
	})
	require.True(t, sc.IsValid())

	return trace.ContextWithSpanContext(context.Background(), sc), sc
}

// TestMarshalHeadersCarriesTraceContext is the producer half of the round
// trip: the traceparent lands in the headers column next to the producer's
// own fields rather than replacing them.
func TestMarshalHeadersCarriesTraceContext(t *testing.T) {
	ctx, sc := contextWithSpan(t)
	instanceID := uuid.New()

	raw, err := marshalHeaders(ctx, AuditHeaders{InstanceID: &instanceID})
	require.NoError(t, err)

	var headers map[string]string
	require.NoError(t, json.Unmarshal(raw, &headers))

	assert.Equal(t, instanceID.String(), headers["instance_id"], "the producer's own headers must survive the merge")
	assert.Equal(t, "00-"+sc.TraceID().String()+"-"+sc.SpanID().String()+"-01", headers["traceparent"])
}

// TestMarshalHeadersWithoutTraceContext pins the pre-existing behaviour for
// events published outside a span: no headers payload still means SQL NULL.
func TestMarshalHeadersWithoutTraceContext(t *testing.T) {
	raw, err := marshalHeaders(context.Background(), nil)
	require.NoError(t, err)
	assert.Nil(t, raw)

	instanceID := uuid.New()
	raw, err = marshalHeaders(context.Background(), AuditHeaders{InstanceID: &instanceID})
	require.NoError(t, err)
	assert.JSONEq(t, `{"instance_id":"`+instanceID.String()+`"}`, string(raw))
}

// TestMarshalHeadersNonObjectPayload covers the one shape the merge cannot
// handle. Losing the traceparent is acceptable there; failing the caller's
// write to the outbox is not.
func TestMarshalHeadersNonObjectPayload(t *testing.T) {
	ctx, _ := contextWithSpan(t)

	raw, err := marshalHeaders(ctx, []string{"not", "an", "object"})
	require.NoError(t, err)
	assert.JSONEq(t, `["not","an","object"]`, string(raw))
}

// TestContextWithTraceRoundTrip is the consumer half: what marshalHeaders
// wrote is what ContextWithTrace reads back, in both of the shapes Debezium
// delivers a JSONB column in.
func TestContextWithTraceRoundTrip(t *testing.T) {
	ctx, sc := contextWithSpan(t)
	instanceID := uuid.New()

	raw, err := marshalHeaders(ctx, AuditHeaders{InstanceID: &instanceID})
	require.NoError(t, err)

	// Debezium serialises a JSONB column either as an object or as a
	// double-encoded JSON string; both must resolve to the same parent.
	doubleEncoded, err := json.Marshal(string(raw))
	require.NoError(t, err)

	for name, delivered := range map[string]json.RawMessage{
		"object":         raw,
		"encoded string": doubleEncoded,
	} {
		t.Run(name, func(t *testing.T) {
			extracted := trace.SpanContextFromContext(ContextWithTrace(context.Background(), delivered))

			require.True(t, extracted.IsValid(), "the consumer must find a parent, not root a new trace")
			assert.Equal(t, sc.TraceID(), extracted.TraceID())
			assert.Equal(t, sc.SpanID(), extracted.SpanID())
			assert.True(t, extracted.IsRemote())
			assert.True(t, extracted.IsSampled())
		})
	}
}

// TestContextWithTraceWithoutTraceContext covers the events that predate
// this and the ones published outside a span: no traceparent must leave the
// context untouched rather than yield a broken parent.
func TestContextWithTraceWithoutTraceContext(t *testing.T) {
	instanceID := uuid.New()

	for name, headers := range map[string]json.RawMessage{
		"empty":            nil,
		"no trace keys":    json.RawMessage(`{"instance_id":"` + instanceID.String() + `"}`),
		"non-string value": json.RawMessage(`{"retries":3}`),
		"malformed":        json.RawMessage(`{`),
	} {
		t.Run(name, func(t *testing.T) {
			assert.False(t, trace.SpanContextFromContext(ContextWithTrace(context.Background(), headers)).IsValid())
		})
	}
}
