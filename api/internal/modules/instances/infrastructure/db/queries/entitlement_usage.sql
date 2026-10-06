-- name: GetEntitlementsUsageForInstanceWithFallback :many
-- One row per entitlement the instance is granted, read through
-- instance_effective_entitlement like every other reader of an instance's
-- entitlement value. now is the same database-time value on every returned
-- row: folded into this query instead of a separate GetDatabaseNow round
-- trip, since every row in one call already agrees on "now" by construction.
SELECT
  iee.entitlement_id,
  e.slug            AS entitlement_slug,
  e.type            AS entitlement_type,
  e.reset_period,
  e.reset_anchor,
  i.license_id,
  i.start_license_date,
  l.slug            AS license_slug,
  iee.value         AS effective_value,
  eu.value          AS usage_value,
  eu.period_start,
  date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
FROM instance i
JOIN instance_effective_entitlement iee
  ON iee.instance_id = i.id
 AND iee.organization_id = sqlc.arg(organization_id)
JOIN entitlement e
  ON e.id = iee.entitlement_id
LEFT JOIN "license" l
  ON l.id = i.license_id
LEFT JOIN entitlement_usage eu
  ON eu.instance_id = i.id
 AND eu.entitlement_id = iee.entitlement_id
 AND eu.organization_id = sqlc.arg(organization_id)
WHERE i.id = sqlc.arg(instance_id)
  AND i.organization_id = sqlc.arg(organization_id);


-- name: GetEntitlementUsageForInstanceOrDefault :one
-- Returns one row always. Nullable fields are nil when the entity is not found;
-- granted_entitlement_id is nil when the instance is not granted the
-- entitlement.
-- now is folded in here too, instead of a separate GetDatabaseNow
-- round trip -- it does not depend on any of the LEFT JOINs below, so it is
-- always populated even when the instance/entitlement/usage row is not found.
SELECT
  i.id              AS instance_id,
  i.license_id      AS license_id,
  i.start_license_date,
  e.id              AS entitlement_id,
  iee.entitlement_id AS granted_entitlement_id,
  e.type            AS entitlement_type,
  e.reset_period,
  e.reset_anchor,
  iee.value         AS effective_value,
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
LEFT JOIN instance_effective_entitlement iee
  ON iee.instance_id    = i.id
 AND iee.entitlement_id = e.id
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
-- Writes the counter without counting a report: the rollover reset of the
-- report path, which leaves report_seq where it is. An ACCEPTED report goes
-- through AcceptEntitlementUsage instead. period_start is NULL for lifetime
-- entitlements and the window's start for periodic ones.
INSERT INTO entitlement_usage (entitlement_id, instance_id, value, organization_id, period_start)
VALUES ($1, $2, $3, sqlc.arg(organization_id), sqlc.arg(period_start))
ON CONFLICT (entitlement_id, instance_id)
  DO UPDATE SET value = EXCLUDED.value, period_start = EXCLUDED.period_start
RETURNING *;


-- name: AcceptEntitlementUsage :one
-- Writes the counter of an ACCEPTED report and moves the pair's report_seq
-- forward by one, returning it: the report_seq of the usage_ledger row the
-- same transaction writes next. A pair's first report creates the row at 1.
-- Runs under the pair's advisory lock, which is what keeps report_seq
-- contiguous.
INSERT INTO entitlement_usage (entitlement_id, instance_id, value, organization_id, period_start, report_seq)
VALUES (sqlc.arg(entitlement_id), sqlc.arg(instance_id), sqlc.arg(value), sqlc.arg(organization_id), sqlc.arg(period_start), 1)
ON CONFLICT (entitlement_id, instance_id)
  DO UPDATE SET value       = EXCLUDED.value,
                period_start = EXCLUDED.period_start,
                report_seq   = entitlement_usage.report_seq + 1
RETURNING report_seq;


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
-- The pair's counter, row-locked. The report reads it under the pair's
-- advisory lock; no row means the pair's first report.
SELECT
  eu.value,
  eu.period_start
FROM entitlement_usage eu
WHERE eu.instance_id = sqlc.arg(instance_id)
  AND eu.entitlement_id = sqlc.arg(entitlement_id)
  AND eu.organization_id = sqlc.arg(organization_id)
  FOR UPDATE OF eu;


-- name: StampReportInstant :one
-- The instant a report is dated by: the usage clock (see GetDatabaseNow), read
-- once the pair's lock is held. It also becomes the transaction's
-- kaiten.entitlement_effective_at, so that instance_effective_entitlement,
-- read next in the same transaction, is evaluated at that same millisecond.
-- set_config is the parameterizable SET LOCAL; true scopes it to the
-- transaction.
SELECT c.now,
       set_config('kaiten.entitlement_effective_at', to_char(c.now, 'YYYY-MM-DD HH24:MI:SS.MS'), true)::text AS effective_at
FROM (SELECT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now) c;


-- name: GetEffectiveEntitlementLimit :one
-- The limit and overage policy a report is gated on: the instance's effective
-- entitlement, read after StampReportInstant. No row means the instance is no
-- longer granted the entitlement.
SELECT iee.value,
       iee.limit_cap_exceeded_overage_percent
FROM instance_effective_entitlement iee
WHERE iee.instance_id = sqlc.arg(instance_id)
  AND iee.entitlement_id = sqlc.arg(entitlement_id)
  AND iee.organization_id = sqlc.arg(organization_id);


-- name: GetEntitlementContextBySlug :one
-- Resolves instance/entitlement slugs and checks the instance is granted the
-- entitlement, in a single round-trip. Returns IDs and metadata needed to then
-- lock and update the usage row, including everything period.Current needs
-- (reset_period/reset_anchor/start_license_date). Includes neither the usage
-- value (GetEntitlementUsageContext, with FOR UPDATE) nor the limit
-- (GetEffectiveEntitlementLimit): both are read under the pair's lock.
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
  l.slug              AS license_slug
FROM instance i
JOIN entitlement e
  ON e.slug            = sqlc.arg(entitlement_slug)
 AND e.organization_id = sqlc.arg(organization_id)
JOIN instance_effective_entitlement iee
  ON iee.instance_id    = i.id
 AND iee.entitlement_id = e.id
LEFT JOIN "license" l
  ON l.id = i.license_id
WHERE i.slug            = sqlc.arg(instance_slug)
  AND i.organization_id = sqlc.arg(organization_id);
