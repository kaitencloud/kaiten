-- +goose Up
-- +goose StatementBegin
-- inbox_events gains a consumer axis: the dedup key becomes
-- (organization_id, source, message_id, consumer) instead of
-- (organization_id, source, message_id).
--
-- Why. One Dapr delivery of a CDC message now fans out to several in-process
-- handlers -- the audit trail, and any connector that consumes the same
-- kaiten.events stream -- and each of them needs its own answer to "have I
-- already done this?". Without this column they share one row, so the first
-- handler to finish would tell every other handler the message was already
-- consumed, and a redelivery caused by ONE handler failing would skip the work
-- of all of them.
--
-- Until now the two consumers of this stream lived in two processes with two
-- Dapr app-ids, and avoided the collision by spelling `source` differently:
-- "debezium:outbox_events" in one, "debezium:outbox_events:attio-connector" in
-- the other. That worked only because they were separate deployments. It also conflated two facts in one column -- WHICH
-- STREAM a message came from, and WHO consumed it -- so a second consumer of the
-- same stream had to lie about the first to get its own row. This separates
-- them: source stays the pipeline, consumer is the handler.
--
-- The backfill is what makes this safe to run against a live database. Every
-- existing row was written by the audit trail subscriber, which was the only
-- consumer in this process, so they are stamped with its name. Leaving them at
-- '' would make every already-processed message look unprocessed to the audit
-- trail and replay the whole retained window into audit_trail on redelivery.
ALTER TABLE "inbox_events" ADD COLUMN "consumer" TEXT NOT NULL DEFAULT '';

UPDATE "inbox_events" SET "consumer" = 'audit-trail' WHERE "consumer" = '';

-- The default existed only to make the ADD COLUMN work on a non-empty table.
-- Keeping it would let a consumer that forgot to name itself write a row under
-- the empty string, which is exactly the collision this column removes.
ALTER TABLE "inbox_events" ALTER COLUMN "consumer" DROP DEFAULT;

ALTER TABLE "inbox_events" DROP CONSTRAINT "inbox_events_org_source_message_key";
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_org_source_message_consumer_key"
  UNIQUE ("organization_id", "source", "message_id", "consumer");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Down is lossy by nature: several consumers' rows for one message collapse into
-- one. Keep the audit trail's -- it is the consumer that existed before this
-- column did, so it is the one whose history the old key described.
DELETE FROM "inbox_events" WHERE "consumer" <> 'audit-trail';

ALTER TABLE "inbox_events" DROP CONSTRAINT "inbox_events_org_source_message_consumer_key";
ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_org_source_message_key"
  UNIQUE ("organization_id", "source", "message_id");

ALTER TABLE "inbox_events" DROP COLUMN "consumer";
-- +goose StatementEnd
