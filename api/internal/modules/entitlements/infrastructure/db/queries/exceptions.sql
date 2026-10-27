-- name: ExceptionClock :one
-- The instant an exception write is decided at.
SELECT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now;


-- name: LockInstanceForException :one
-- The instance an exception is written on, locked so its exception writes
-- serialize (the exclusion constraint still guards the pair).
SELECT i.id, i.slug
FROM instance i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.slug = sqlc.arg(slug)
FOR NO KEY UPDATE OF i;


-- name: GetInstanceForException :one
SELECT i.id, i.slug
FROM instance i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.slug = sqlc.arg(slug);


-- name: GetEntitlementForException :one
SELECT e.id, e.slug, e.type
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.slug = sqlc.arg(slug);


-- name: FindOverlappingException :one
-- The unrevoked exception of the pair whose window meets [starts, ends):
-- what the exclusion constraint would refuse (INV-37).
SELECT x.id
FROM instance_entitlement_exception x
WHERE x.organization_id = sqlc.arg(organization_id)
  AND x.instance_id = sqlc.arg(instance_id)
  AND x.entitlement_id = sqlc.arg(entitlement_id)
  AND x.revoked_at IS NULL
  AND tsrange(x.starts_at, x.ends_at, '[)') && tsrange(sqlc.arg(starts_at)::timestamp, sqlc.narg(ends_at)::timestamp, '[)')
ORDER BY x.starts_at, x.id
LIMIT 1;


-- name: InsertEntitlementException :one
INSERT INTO instance_entitlement_exception (organization_id, instance_id, entitlement_id, kind, value, starts_at, ends_at,
                                            reason, created_at, created_by_id)
VALUES (sqlc.arg(organization_id), sqlc.arg(instance_id), sqlc.arg(entitlement_id), sqlc.arg(kind),
        sqlc.narg(value), sqlc.arg(starts_at), sqlc.narg(ends_at), sqlc.arg(reason), sqlc.arg(now), sqlc.arg(user_id))
RETURNING id;


-- name: ListEntitlementExceptions :many
-- An instance's exceptions, latest start first (§13.16): with only_active,
-- those neither revoked nor ended at now, scheduled ones included.
SELECT x.id, x.kind, x.value, x.starts_at, x.ends_at, x.reason, x.created_at, x.revoked_at,
       e.slug AS entitlement_slug, e.type AS entitlement_type
FROM instance_entitlement_exception x
JOIN entitlement e ON e.id = x.entitlement_id AND e.organization_id = x.organization_id
WHERE x.organization_id = sqlc.arg(organization_id)
  AND x.instance_id = sqlc.arg(instance_id)
  AND (sqlc.narg(id)::uuid IS NULL OR x.id = sqlc.narg(id)::uuid)
  AND (NOT sqlc.arg(only_active)::boolean
       OR (x.revoked_at IS NULL AND (x.ends_at IS NULL OR x.ends_at > sqlc.arg(now)::timestamp)))
ORDER BY x.starts_at DESC, x.id DESC;


-- name: RevokeEntitlementException :execrows
-- Revokes an exception neither revoked nor ended: a scheduled one never
-- starts, an active one ends at once. The row stays.
UPDATE instance_entitlement_exception
SET revoked_at    = sqlc.arg(now),
    revoked_by_id = sqlc.arg(user_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND instance_id = sqlc.arg(instance_id)
  AND id = sqlc.arg(id)
  AND revoked_at IS NULL
  AND (ends_at IS NULL OR ends_at > sqlc.arg(now)::timestamp);


-- name: ListExpiredExceptions :many
-- The exceptions whose end passed, not revoked and not announced yet, oldest
-- end first: billing-lifecycle step (g) (§16.2,
-- idx_instance_entitlement_exception_expiry). Across organizations; each is
-- announced in its own transaction.
SELECT x.id, x.organization_id
FROM instance_entitlement_exception x
WHERE x.ends_at <= sqlc.arg(now)::timestamp
  AND x.revoked_at IS NULL
  AND x.expired_notified_at IS NULL
ORDER BY x.ends_at, x.id
LIMIT sqlc.arg(page_size);


-- name: MarkExceptionExpired :one
-- Sets the once-only marker of the .expired event, if the exception is still
-- ended, unrevoked and unannounced; no row when another pass got there first.
-- Returns the instance the event names.
WITH marked AS (
  UPDATE instance_entitlement_exception x
  SET expired_notified_at = sqlc.arg(now)::timestamp
  WHERE x.organization_id = sqlc.arg(organization_id)
    AND x.id = sqlc.arg(id)
    AND x.ends_at <= sqlc.arg(now)::timestamp
    AND x.revoked_at IS NULL
    AND x.expired_notified_at IS NULL
  RETURNING x.instance_id, x.organization_id
)
SELECT i.id, i.slug
FROM marked m
JOIN instance i ON i.id = m.instance_id AND i.organization_id = m.organization_id;


-- name: ListEntitlementExceptionsByInstances :many
-- The exceptions of several instances, for Instance.entitlementExceptions:
-- each instance's in the order of the list route (§13.16).
SELECT x.instance_id, x.id, x.kind, x.value, x.starts_at, x.ends_at, x.reason, x.created_at, x.revoked_at,
       e.slug AS entitlement_slug, e.type AS entitlement_type
FROM instance_entitlement_exception x
JOIN entitlement e ON e.id = x.entitlement_id AND e.organization_id = x.organization_id
WHERE x.organization_id = sqlc.arg(organization_id)
  AND x.instance_id = ANY (sqlc.arg(instance_ids)::uuid[])
ORDER BY x.instance_id, x.starts_at DESC, x.id DESC;


-- name: CountActiveExceptions :many
-- The exceptions in force at now, all organizations, by kind: the
-- kaiten.entitlements.exceptions.active gauge, read by step (g) (§19.1).
SELECT x.kind, count(*)::bigint AS active
FROM instance_entitlement_exception x
WHERE x.revoked_at IS NULL
  AND x.starts_at <= sqlc.arg(now)::timestamp
  AND (x.ends_at IS NULL OR sqlc.arg(now)::timestamp < x.ends_at)
GROUP BY x.kind;
