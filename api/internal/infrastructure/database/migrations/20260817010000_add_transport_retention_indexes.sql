-- +goose Up
-- +goose StatementBegin
-- Retention deletes one old batch at a time and orders equal timestamps by
-- id, so both columns belong in the transport-table indexes.
CREATE INDEX "idx_outbox_events_retention"
  ON "outbox_events" ("occurred_at", "id");
CREATE INDEX "idx_inbox_events_retention"
  ON "inbox_events" ("processed_at", "id");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS "idx_inbox_events_retention";
DROP INDEX IF EXISTS "idx_outbox_events_retention";
-- +goose StatementEnd
