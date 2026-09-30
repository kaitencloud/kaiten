-- name: CreateAuditTrail :one
-- Returns the id so the caller can announce the entry on the same transaction --
-- see the Announcer in ../../subscriber.
INSERT INTO audit_trail (organization_id, instance_id, event_name, event_type, occurred_at, payload)
VALUES (
  sqlc.arg(organization_id),
  sqlc.narg(instance_id),
  sqlc.arg(event_name),
  sqlc.arg(event_type),
  sqlc.arg(occurred_at),
  sqlc.arg(payload)
)
RETURNING id;


-- name: ListOrganizationAuditTrails :many
-- Cursor (keyset) pagination: ordered by occurred_at DESC, id DESC (id
-- tie-breaks occurred_at, which is not guaranteed unique). Pass
-- limit_plus_one = requested limit + 1 so the caller can detect whether a
-- further page exists without a separate COUNT query. On the first page,
-- pass NULL for both cursor_occurred_at and cursor_id.
SELECT
  at.id,
  at.instance_id,
  i.slug AS instance_slug,
  i.name AS instance_name,
  c.id AS customer_id,
  c.slug AS customer_slug,
  c.name AS customer_name,
  at.event_name,
  at.event_type,
  at.occurred_at,
  at.payload
FROM audit_trail at
LEFT JOIN instance i ON at.instance_id = i.id
LEFT JOIN customer c ON i.customer_id = c.id
WHERE at.organization_id = sqlc.arg(organization_id)
  AND (sqlc.narg(event_name)::text IS NULL OR at.event_name = sqlc.narg(event_name))
  AND (sqlc.narg(after_ts)::timestamptz IS NULL OR at.occurred_at >= sqlc.narg(after_ts))
  AND (sqlc.narg(before_ts)::timestamptz IS NULL OR at.occurred_at <= sqlc.narg(before_ts))
  AND (
    sqlc.narg(cursor_occurred_at)::timestamptz IS NULL
    OR (at.occurred_at, at.id) < (sqlc.narg(cursor_occurred_at)::timestamptz, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY at.occurred_at DESC, at.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: ListAuditTrails :many
-- Cursor (keyset) pagination -- see ListOrganizationAuditTrails's comment
-- above for the parameter contract, which this query shares.
SELECT
  at.id,
  at.instance_id,
  i.slug AS instance_slug,
  at.event_name,
  at.event_type,
  at.occurred_at,
  at.payload
FROM audit_trail at
INNER JOIN instance i ON at.instance_id = i.id
WHERE at.organization_id = sqlc.arg(organization_id)
  AND i.slug = sqlc.arg(instance_slug)
  AND (sqlc.narg(event_name)::text IS NULL OR at.event_name = sqlc.narg(event_name))
  AND (sqlc.narg(after_ts)::timestamptz IS NULL OR at.occurred_at >= sqlc.narg(after_ts))
  AND (sqlc.narg(before_ts)::timestamptz IS NULL OR at.occurred_at <= sqlc.narg(before_ts))
  AND (
    sqlc.narg(cursor_occurred_at)::timestamptz IS NULL
    OR (at.occurred_at, at.id) < (sqlc.narg(cursor_occurred_at)::timestamptz, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY at.occurred_at DESC, at.id DESC
LIMIT sqlc.arg(limit_plus_one);
