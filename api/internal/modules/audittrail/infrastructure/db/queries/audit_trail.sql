-- name: CreateAuditTrail :one
-- Returns the id so the caller can announce the entry on the same transaction --
-- see the Announcer in ../../subscriber.
INSERT INTO audit_trail (organization_id, instance_id, actor_id, event_name, event_type, occurred_at, payload)
VALUES (
  sqlc.arg(organization_id),
  sqlc.narg(instance_id),
  sqlc.narg(actor_id),
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
  at.actor_id,
  u.name AS actor_name,
  COALESCE(u.type::text, '')::text AS actor_type,
  u.external_id AS actor_external_id,
  at.event_name,
  at.event_type,
  at.occurred_at,
  at.payload
FROM audit_trail at
LEFT JOIN instance i ON at.instance_id = i.id
LEFT JOIN customer c ON i.customer_id = c.id
LEFT JOIN "user" u ON u.id = at.actor_id
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


-- name: ListOrganizationChanges :many
-- ListOrganizationAuditTrails without the reads, evaluations and reports SDKs
-- produce in bulk: what people, service accounts and Kaiten changed. Pagination
-- and filters as above. The event list is written here rather than bound as a
-- parameter, and is idx_audit_trail_changes' list, character for character:
-- with a bound list a generic plan cannot prove that index applies, and walks
-- past every SDK event of every organization (seconds on a large trail).
SELECT
  at.id,
  at.instance_id,
  i.slug AS instance_slug,
  i.name AS instance_name,
  c.id AS customer_id,
  c.slug AS customer_slug,
  c.name AS customer_name,
  at.actor_id,
  u.name AS actor_name,
  COALESCE(u.type::text, '')::text AS actor_type,
  u.external_id AS actor_external_id,
  at.event_name,
  at.event_type,
  at.occurred_at,
  at.payload
FROM audit_trail at
LEFT JOIN instance i ON at.instance_id = i.id
LEFT JOIN customer c ON i.customer_id = c.id
LEFT JOIN "user" u ON u.id = at.actor_id
WHERE at.organization_id = sqlc.arg(organization_id)
  AND at.event_name <> ALL('{ENTITLEMENT_VALUE_GET,ENTITLEMENT_USAGE_REPORT_ACCEPTED,ENTITLEMENT_USAGE_REPORT_REJECTED,FEATURE_FLAG_EVALUATED,INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER,INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED,INSTANCE_ENTITLEMENT_USAGE_REACHED,INSTANCE_ENTITLEMENT_CAP_EXCEEDED}'::text[])
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
  at.actor_id,
  u.name AS actor_name,
  COALESCE(u.type::text, '')::text AS actor_type,
  u.external_id AS actor_external_id,
  at.event_name,
  at.event_type,
  at.occurred_at,
  at.payload
FROM audit_trail at
INNER JOIN instance i ON at.instance_id = i.id
LEFT JOIN "user" u ON u.id = at.actor_id
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


-- name: ListOrganizationsWithAuditTrailBefore :many
-- The organizations the retention pass (see ../../../auditretention) has any
-- reason to look up: those holding an entry older than the shortest window
-- there is. One index probe per organization, on
-- idx_audit_trail_org_occurred_at.
SELECT o.id
FROM organization o
WHERE EXISTS (
  SELECT 1
  FROM audit_trail at
  WHERE at.organization_id = o.id
    AND at.occurred_at < sqlc.arg(before)
);

-- name: PurgeOrganizationAuditTrail :execrows
-- One bounded batch of an organization's entries older than cutoff, oldest
-- first, so a backlog is drained over many short transactions instead of one
-- long one holding locks and bloating WAL. idx_audit_trail_org_occurred_at
-- serves the predicate and the order, so a batch reads only the rows it
-- deletes. SKIP LOCKED avoids waiting behind a transaction touching an expired
-- row; notification_read rows go with the entry (ON DELETE CASCADE).
WITH expired AS (
  SELECT at.id
  FROM audit_trail at
  WHERE at.organization_id = sqlc.arg(organization_id)
    AND at.occurred_at < sqlc.arg(cutoff)
  ORDER BY at.occurred_at, at.id
  LIMIT sqlc.arg(batch_size)
  FOR UPDATE SKIP LOCKED
)
DELETE FROM audit_trail at
USING expired
WHERE at.id = expired.id;
