-- name: CreateOutboxEvent :exec
INSERT INTO outbox_events (organization_id,
                           event_name,
                           event_type,
                           data,
                           headers)
VALUES (sqlc.arg(organization_id),
    sqlc.arg(event_name),
    sqlc.arg(event_type),
    sqlc.arg(data),
    sqlc.narg(headers));


-- name: CreateOutboxEvents :copyfrom
-- Batch variant of CreateOutboxEvent, one round trip via COPY instead of one
-- INSERT per event. For callers that can legitimately emit many events in a
-- single transaction (e.g. the periodic-usage rollover, which
-- materializes one event per skipped window with no upper bound).
INSERT INTO outbox_events (organization_id,
                           event_name,
                           event_type,
                           data,
                           headers)
VALUES (sqlc.arg(organization_id),
    sqlc.arg(event_name),
    sqlc.arg(event_type),
    sqlc.arg(data),
    sqlc.arg(headers));


-- name: ListOutboxEvents :many
SELECT id,
       organization_id,
       event_name,
       event_type,
       occurred_at,
       data,
       headers
FROM outbox_events
WHERE organization_id = sqlc.arg(organization_id)
ORDER BY occurred_at DESC;


-- name: GetPendingOutboxEventsWithOrg :many
SELECT
    oe.id,
    oe.organization_id,
    oe.event_name,
    oe.event_type,
    oe.occurred_at,
    oe.data,
    oe.headers
FROM outbox_events oe
JOIN organization o ON oe.organization_id = o.id
ORDER BY oe.occurred_at ASC
LIMIT sqlc.arg(batch_size);


-- name: DeleteOutboxEvent :exec
DELETE FROM outbox_events WHERE id = $1;
