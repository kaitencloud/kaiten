// Package cdc_test exercises the CDC delivery path end to end against a real
// Postgres instance and the real Fiber app: the properties it checks -- that a
// consumer's inbox mark and its work commit or roll back together, and that one
// delivery fans out to several consumers with independent state -- only exist at
// the transaction level, so none of them can be observed with a fake DBTX.
//
// This file covers the audit trail through the whole wired route. dispatcher_test.go
// covers the fan-out itself, with consumers it controls.
package cdc_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/propagation"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	outboxdb "github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/audittrail/subscriber"
	commonfixture "github.com/kaitencloud/kaiten/api/tests/integrations"
)

const (
	// daprRoute is where the Dapr sidecar posts CDC events.
	daprRoute = "/dapr/cdc/events"

	// inboxSource mirrors cdc.Source, the pipeline every consumer here reads from.
	inboxSource = "debezium:outbox_events"
)

// TestAuditTrailSubscriberInboxOrdering tests that a failure of the audit
// row insert leaves no inbox row behind, so the redelivery is processed
// instead of being skipped as a duplicate. Marking the event processed
// before doing the work turned an at-least-once pipeline into silent loss:
// the retry saw the mark and dropped the event.
func TestAuditTrailSubscriberInboxOrdering(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	organizationID := testDb.DefaultData.OrganizationID
	eventID := uuid.New()
	eventName := "INSTANCE_CREATION"
	delivery := cdcDelivery(t, eventID, organizationID, eventName, nil)

	// Fail the work step, the way a downstream error or a crash between the
	// two statements would. The constraint is on audit_trail only, so the
	// inbox insert itself still succeeds -- which is exactly the window the
	// defect lived in.
	execSQL(t, `ALTER TABLE audit_trail ADD CONSTRAINT audit_trail_fault_injection CHECK (false) NOT VALID`)

	require.Equal(t, "RETRY", deliver(t, delivery), "a failed audit insert must ask the sidecar to redeliver")
	require.Zero(t, countAuditRows(t, organizationID, eventName), "no audit row should exist after the insert failed")
	require.Zero(t, countInboxRows(t, organizationID, eventID, subscriber.ConsumerName),
		"the inbox mark must roll back with the audit row, otherwise the redelivery is skipped as a duplicate")

	execSQL(t, `ALTER TABLE audit_trail DROP CONSTRAINT audit_trail_fault_injection`)

	// The sidecar redelivers the very same message. It must be processed.
	require.Equal(t, "SUCCESS", deliver(t, delivery))
	require.Equal(t, 1, countAuditRows(t, organizationID, eventName), "the redelivered event must be recorded, not skipped")
	require.Equal(t, 1, countInboxRows(t, organizationID, eventID, subscriber.ConsumerName))

	// Dedup still holds once the work actually happened: a further
	// redelivery writes nothing more.
	require.Equal(t, "SUCCESS", deliver(t, delivery))
	require.Equal(t, 1, countAuditRows(t, organizationID, eventName), "a redelivery after a successful write must be a no-op")
}

// TestAuditTrailSubscriberJoinsProducerTrace asserts the property the whole
// outbox pipeline is observable through: the trace of the request that
// produced an event survives the round trip through Postgres and the CDC
// stream, so the consumer span is a child of the producer's rather than the
// root of a brand-new trace nothing can be correlated with.
func TestAuditTrailSubscriberJoinsProducerTrace(t *testing.T) {
	t.Cleanup(func() { require.NoError(t, testDb.Reset()) })

	// The subscriber and the outbox repository both resolve their tracer
	// from the global provider, the way they do in a running process.
	spans := tracetest.NewSpanRecorder()
	previousProvider, previousPropagator := otel.GetTracerProvider(), otel.GetTextMapPropagator()
	otel.SetTracerProvider(sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(spans)))
	otel.SetTextMapPropagator(propagation.TraceContext{})
	t.Cleanup(func() {
		otel.SetTracerProvider(previousProvider)
		otel.SetTextMapPropagator(previousPropagator)
	})

	organizationID := testDb.DefaultData.OrganizationID
	eventName := "INSTANCE_CREATION"

	// Produce the event the way a request handler does: inside a span,
	// through the real repository.
	ctx, requestSpan := otel.Tracer("test.producer").Start(t.Context(), "http.request")
	err := outbox.NewOutboxRepository(outboxdb.New(testDb.DbPool)).CreateOutboxEvent(ctx, outbox.NewOutboxMessage(
		organizationID, eventName, "1.0",
		map[string]string{"slug": "test-instance"},
		outbox.AuditHeaders{},
	))
	require.NoError(t, err)
	requestSpan.End()

	rows := commonfixture.ListOutboxEvents(t, testDb.DbPool, organizationID)
	require.Len(t, rows, 1)
	row := rows[0]
	require.Contains(t, string(row.Headers), "traceparent",
		"the producer must record its trace context in the headers column, or the chain stops here")

	require.Equal(t, "SUCCESS", deliver(t, cdcDelivery(t, row.ID, organizationID, eventName, row.Headers)))
	require.Equal(t, 1, countAuditRows(t, organizationID, eventName))

	publish := findSpan(t, spans, "outbox.publish")
	consumer := findSpan(t, spans, "cdc.consume")

	assert.Equal(t, requestSpan.SpanContext().TraceID(), consumer.SpanContext().TraceID(),
		"the consumer span must stay in the trace of the request that produced the event")
	assert.Equal(t, publish.SpanContext().SpanID(), consumer.Parent().SpanID(),
		"the consumer span's parent must be the publish span the traceparent named")
	assert.True(t, consumer.Parent().IsRemote(), "the parent arrived over the wire, not from this process")
}

// findSpan returns the single ended span with the given name.
func findSpan(t *testing.T, spans *tracetest.SpanRecorder, name string) sdktrace.ReadOnlySpan {
	t.Helper()

	var found []sdktrace.ReadOnlySpan
	for _, span := range spans.Ended() {
		if span.Name() == name {
			found = append(found, span)
		}
	}
	require.Len(t, found, 1, "expected exactly one %q span", name)

	return found[0]
}

// cdcDelivery builds one Dapr pub/sub HTTP delivery: a CloudEvents envelope
// wrapping the Debezium change event whose payload.after is the
// outbox_events row. Debezium serialises JSONB columns as JSON-encoded
// strings, as data and headers are here.
func cdcDelivery(t *testing.T, eventID, organizationID uuid.UUID, eventName string, headers []byte) map[string]any {
	t.Helper()

	after := map[string]any{
		"id":              eventID.String(),
		"organization_id": organizationID.String(),
		"event_name":      eventName,
		"event_type":      "1.0",
		"data":            `{"slug":"test-instance"}`,
		"occurred_at":     time.Now().UTC().Format(time.RFC3339Nano),
	}
	if len(headers) > 0 {
		after["headers"] = string(headers)
	}

	return map[string]any{
		"data": map[string]any{
			"payload": map[string]any{
				"after": after,
			},
		},
	}
}

// deliver posts one CDC delivery to the subscriber route and returns the
// Dapr status the handler answered with (SUCCESS, RETRY or DROP).
func deliver(t *testing.T, body map[string]any) string {
	t.Helper()

	req := commonfixture.NewJSONRequest(t, "POST", daprRoute, body)
	resp, err := testServer.App.Test(req, fiber.TestConfig{})
	require.NoError(t, err)
	defer commonfixture.MustCloseBody(t, resp.Body)

	var decoded struct {
		Status string `json:"status"`
	}
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&decoded))
	require.Equal(t, fiber.StatusOK, resp.StatusCode)

	return decoded.Status
}

func countAuditRows(t *testing.T, organizationID uuid.UUID, eventName string) int {
	t.Helper()

	var count int
	err := testDb.DbPool.QueryRow(
		t.Context(),
		`SELECT count(*) FROM audit_trail WHERE organization_id = $1 AND event_name = $2`,
		organizationID, eventName,
	).Scan(&count)
	require.NoError(t, err)

	return count
}

// countInboxRows counts the marks one named consumer left for one message. Keyed on
// the consumer as well as the message because that is what the dedup key is now: a
// count that ignored it would report another consumer's row as this one's, which is
// precisely the confusion the column was added to remove.
func countInboxRows(t *testing.T, organizationID, eventID uuid.UUID, consumer string) int {
	t.Helper()

	var count int
	err := testDb.DbPool.QueryRow(
		t.Context(),
		`SELECT count(*) FROM inbox_events
		  WHERE organization_id = $1 AND source = $2 AND message_id = $3 AND consumer = $4`,
		organizationID, inboxSource, eventID.String(), consumer,
	).Scan(&count)
	require.NoError(t, err)

	return count
}

func execSQL(t *testing.T, sql string) {
	t.Helper()

	_, err := testDb.DbPool.Exec(t.Context(), sql)
	require.NoError(t, err)
}
