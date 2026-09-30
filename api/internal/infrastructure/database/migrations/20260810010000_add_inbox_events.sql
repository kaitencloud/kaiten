-- +goose Up
-- +goose StatementBegin
-- inbox_events is the incoming-side counterpart to outbox_events: a record
-- that a given message from a given source has already been processed, so
-- an at-least-once delivery of the same message can be recognised and
-- skipped instead of double-processed.
--
-- Grounded in a real, currently-unprotected consumer:
-- internal/modules/audittrail/subscriber/handler.go
-- receives Debezium CDC events (sourced from outbox_events) over a Dapr
-- pub/sub HTTP push from RabbitMQ, and explicitly returns a "RETRY" status
-- to Dapr on transient DB errors - which tells Dapr to redeliver the same
-- message. Neither that retry path nor RabbitMQ/Dapr's own at-least-once
-- delivery guarantee is currently deduplicated: CreateAuditTrail always
-- inserts a fresh row, discarding the incoming event's own id. This table
-- gives that (and any future incoming-event consumer) a place to record
-- "seen it" against a natural dedup key (source + the source's own message
-- id), scoped by organization_id like every other multi-tenant table in
-- this schema.
--
-- This is judgment-call shape, not a literal spec: no formal design
-- existed beyond "inbox table - needs a migration". source/message_id
-- as the dedup key and organization_id as the tenant scope are inferred
-- from outbox_events/debezium.Event's actual shape (see pkg/debezium),
-- not dictated by any consumer wiring - this migration does not modify
-- the audit trail subscriber or any other consumer.
CREATE TABLE "inbox_events"
(
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID        NOT NULL,
  "source"          TEXT        NOT NULL,
  "message_id"      TEXT        NOT NULL,
  "processed_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "inbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inbox_events_org_source_message_key" UNIQUE ("organization_id", "source", "message_id")
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "inbox_events";
-- +goose StatementEnd
