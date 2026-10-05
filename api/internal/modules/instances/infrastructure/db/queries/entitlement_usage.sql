-- name: GetEntitlementsUsageForInstanceWithFallback :many
-- now is the same database-time value on every returned row:
-- folded into this query instead of a separate GetDatabaseNow round trip,
-- since every row in one call already agrees on "now" by construction.
SELECT
  le.entitlement_id,
  e.slug            AS entitlement_slug,
  e.type            AS entitlement_type,
  e.reset_period,
  e.reset_anchor,
  i.license_id,
  i.start_license_date,
  l.slug            AS license_slug,
  le.value          AS license_value,
  eu.value          AS usage_value,
  eu.period_start,
  date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
FROM instance i
JOIN license_entitlement le
  ON le.license_id = i.license_id
 AND le.organization_id = sqlc.arg(organization_id)
JOIN entitlement e
  ON e.id = le.entitlement_id
LEFT JOIN "license" l
  ON l.id = i.license_id
LEFT JOIN entitlement_usage eu
  ON eu.instance_id = i.id
 AND eu.entitlement_id = le.entitlement_id
 AND eu.organization_id = sqlc.arg(organization_id)
WHERE i.id = sqlc.arg(instance_id)
  AND i.organization_id = sqlc.arg(organization_id);


-- name: GetEntitlementUsageForInstanceOrDefault :one
-- Returns one row always. Nullable fields are nil when the entity is not found.
-- now is folded in here too, instead of a separate GetDatabaseNow
-- round trip -- it does not depend on any of the LEFT JOINs below, so it is
-- always populated even when the instance/entitlement/usage row is not found.
SELECT
  i.id              AS instance_id,
  i.license_id      AS license_id,
  i.start_license_date,
  e.id              AS entitlement_id,
  le.id             AS license_entitlement_id,
  e.type            AS entitlement_type,
  e.reset_period,
  e.reset_anchor,
  le.value          AS license_value,
  eu.value          AS usage_value,
  eu.period_start,
  e.slug            AS entitlement_slug,
  l.slug            AS license_slug,
  date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
FROM (VALUES (true)) AS sentinel(ok)
LEFT JOIN instance i
  ON i.slug            = sqlc.arg(instance_slug)
 AND i.organization_id = sqlc.arg(organization_id)
LEFT JOIN entitlement e
  ON e.slug            = sqlc.arg(entitlement_slug)
 AND e.organization_id = sqlc.arg(organization_id)
LEFT JOIN license_entitlement le
  ON le.license_id     = i.license_id
 AND le.entitlement_id = e.id
 AND le.organization_id = sqlc.arg(organization_id)
LEFT JOIN entitlement_usage eu
  ON eu.instance_id    = i.id
 AND eu.entitlement_id = e.id
 AND eu.organization_id = sqlc.arg(organization_id)
LEFT JOIN "license" l
  ON l.id = i.license_id;


-- name: GetEntitlementUsageForInstance :one
SELECT eu.entitlement_id, eu.instance_id, eu.value, eu.period_start, eu.organization_id, i.license_id,
       e.slug AS entitlement_slug, l.slug AS license_slug
FROM entitlement_usage eu
       JOIN instance i ON eu.instance_id = i.id
       JOIN entitlement e ON eu.entitlement_id = e.id
       LEFT JOIN "license" l ON i.license_id = l.id
WHERE eu.instance_id = $1
  AND eu.organization_id = sqlc.arg(organization_id)
  AND eu.entitlement_id = sqlc.arg(entitlement_id);


-- name: ReportEntitlementUsage :exec
-- period_start is NULL for lifetime entitlements (unchanged legacy
-- behavior) and the current window's start for periodic ones -- the report
-- path always passes the value it wants stored, whether continuing the
-- active window or rolling over to a new one.
INSERT INTO entitlement_usage (entitlement_id, instance_id, value, organization_id, period_start)
VALUES ($1, $2, $3, sqlc.arg(organization_id), sqlc.arg(period_start))
ON CONFLICT (entitlement_id, instance_id)
  DO UPDATE SET value = EXCLUDED.value, period_start = EXCLUDED.period_start
RETURNING *;


-- name: GetDatabaseNow :one
-- The single time source for usage: never the application node's wall clock,
-- so reads and reports on different replicas agree on "now". clock_timestamp()
-- rather than now(): now() is frozen at the transaction's BEGIN, and a report
-- reads this after waiting for its pair's lock. Truncated rather than cast:
-- the ::timestamp(3) cast rounds, which moves 23:59:59.9996 into the next
-- window. Every usage read uses this same expression.
SELECT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now;


-- name: LockEntitlementUsage :exec
-- Serializes reports for one instance/entitlement pair even before its first
-- entitlement_usage row exists. A row-level FOR UPDATE lock cannot cover that case.
SELECT pg_advisory_xact_lock(hashtextextended(
  sqlc.arg(instance_id)::uuid::text || ':' || sqlc.arg(entitlement_id)::uuid::text,
  0
));


-- name: GetEntitlementUsageContext :one
SELECT
  eu.entitlement_id,
  eu.instance_id,
  eu.value,
  eu.period_start,
  eu.organization_id,
  i.license_id,
  e.type as entitlement_type,
  e.aggregation_method,
  e.warning_threshold_percent,
  le.value as license_entitlement_value,
  le.limit_cap_exceeded_overage_percent
FROM entitlement_usage eu
       JOIN instance i ON eu.instance_id = i.id
       JOIN entitlement e ON eu.entitlement_id = e.id
       JOIN license_entitlement le ON le.license_id = i.license_id AND le.entitlement_id = eu.entitlement_id
WHERE eu.instance_id = $1
  AND eu.entitlement_id = sqlc.arg(entitlement_id)
  AND eu.organization_id = sqlc.arg(organization_id)
  FOR UPDATE OF eu;


-- name: GetEntitlementContextBySlug :one
-- Resolves instance/entitlement slugs and validates the license entitlement in a single
-- round-trip. Returns IDs and metadata needed to then lock and update the usage row,
-- including everything period.Current needs (reset_period/reset_anchor/start_license_date).
-- Does NOT include the usage value — call GetEntitlementUsageContext for that (with FOR UPDATE).
SELECT
  i.id                AS instance_id,
  i.license_id,
  i.start_license_date,
  e.id                AS entitlement_id,
  e.slug              AS entitlement_slug,
  e.type              AS entitlement_type,
  e.aggregation_method,
  e.warning_threshold_percent,
  e.reset_period,
  e.reset_anchor,
  le.value            AS license_entitlement_value,
  le.limit_cap_exceeded_overage_percent,
  l.slug              AS license_slug
FROM instance i
JOIN entitlement e
  ON e.slug            = sqlc.arg(entitlement_slug)
 AND e.organization_id = sqlc.arg(organization_id)
JOIN license_entitlement le
  ON le.license_id     = i.license_id
 AND le.entitlement_id = e.id
 AND le.organization_id = sqlc.arg(organization_id)
LEFT JOIN "license" l
  ON l.id = i.license_id
WHERE i.slug            = sqlc.arg(instance_slug)
  AND i.organization_id = sqlc.arg(organization_id);
