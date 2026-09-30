-- name: MarkInboxEventProcessed :one
-- Atomically records that (organization_id, source, message_id) has been
-- processed BY ONE NAMED CONSUMER. Returns the new row's id on first processing,
-- or no row (pgx.ErrNoRows) if it was already recorded - the caller uses that to
-- distinguish "process it" from "duplicate delivery, skip it" without a separate
-- existence check racing the insert.
--
-- consumer is part of the key because one delivery fans out to several in-process
-- handlers: each needs its own answer, so that a redelivery caused by one handler
-- failing re-runs only that handler. ON CONFLICT DO NOTHING is also what makes two
-- concurrent deliveries safe -- the second insert blocks on the first's uncommitted
-- row and then either finds it committed (skip) or takes over (process).
INSERT INTO inbox_events (organization_id, source, message_id, consumer)
VALUES (sqlc.arg(organization_id), sqlc.arg(source), sqlc.arg(message_id), sqlc.arg(consumer))
ON CONFLICT (organization_id, source, message_id, consumer) DO NOTHING
RETURNING id;
