-- +goose Up
-- +goose StatementBegin
-- The trace context of the request that produced an event, in the two
-- attributes of the CloudEvents Distributed Tracing extension:
-- https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/distributed-tracing.md
--
-- headers already carries both, inside a JSON document. These columns exist
-- because Debezium cannot reach into it: its Outbox EventRouter places a
-- column, not a JSON key, in a record header, and the CloudEvents converter
-- takes the envelope's traceparent from that header. The Dapr sidecar starts
-- its delivery span only from the envelope's traceparent (dapr/dapr#9990).
-- tracestate stops at the header: the converter writes traceparent alone.
--
-- traceparent is NOT NULL because the converter declares the attribute
-- required: one row without it fails Debezium's engine, and every event behind
-- it waits. An event with no trace -- telemetry off, a row written by hand --
-- gets a fresh context flagged not sampled, which every tracer ignores. The
-- API writes its own (outbox.traceContext); the default is for everyone else.
ALTER TABLE "outbox_events"
  ADD COLUMN "traceparent" TEXT NOT NULL DEFAULT
    '00-' || replace(gen_random_uuid()::text, '-', '')
    || '-' || left(replace(gen_random_uuid()::text, '-', ''), 16) || '-00',
  ADD COLUMN "tracestate"  TEXT;

-- Rows written before these columns take the trace headers recorded; the
-- default above has already given the others theirs. Debezium does not
-- re-publish them: the outbox is append-only and its connectors skip updates.
UPDATE "outbox_events"
SET "traceparent" = "headers" ->> 'traceparent',
    "tracestate"  = "headers" ->> 'tracestate'
WHERE jsonb_typeof("headers") = 'object' AND "headers" ? 'traceparent';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "outbox_events"
  DROP COLUMN "traceparent",
  DROP COLUMN "tracestate";
-- +goose StatementEnd
