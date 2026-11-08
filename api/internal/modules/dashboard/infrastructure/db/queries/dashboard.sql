-- The dashboard summary: every figure the console's home needs, computed in
-- the database over the whole organization, in one request. Each query answers
-- one block of GET /dashboard/summary; none paginates, because each one is an
-- aggregate or a short, bounded list.

-- name: DashboardCustomerCounts :one
SELECT
  count(*)::bigint AS total,
  count(*) FILTER (WHERE c.created_at >= sqlc.arg(since))::bigint AS created_in_range
FROM customer c
WHERE c.organization_id = sqlc.arg(organization_id);

-- name: DashboardInstanceCounts :one
SELECT
  count(*)::bigint AS total,
  count(*) FILTER (WHERE i.created_at >= sqlc.arg(since))::bigint AS created_in_range,
  count(*) FILTER (WHERE i.status = 'HEALTHY')::bigint AS healthy,
  count(*) FILTER (WHERE i.status = 'DEGRADED')::bigint AS degraded,
  count(*) FILTER (WHERE i.status = 'INCIDENT')::bigint AS incident,
  count(*) FILTER (WHERE i.status = 'MAINTENANCE')::bigint AS maintenance
FROM instance i
WHERE i.organization_id = sqlc.arg(organization_id)
 ;

-- name: DashboardInstancesNotHealthy :many
SELECT i.slug, i.name, c.name AS customer_name, c.slug AS customer_slug, i.status::text AS status
FROM instance i
JOIN customer c ON c.id = i.customer_id
WHERE i.organization_id = sqlc.arg(organization_id)
 
  AND i.status <> 'HEALTHY'
ORDER BY i.updated_at DESC
LIMIT 5;

-- name: DashboardMeters :many
-- Every metered grant with observed usage, with the grant the instance is
-- entitled to once its License, add-ons, boosts and exceptions are combined
-- (the instance_effective_entitlement view). How close it is to the most the
-- grant allows is computed by the caller: the allowance and the unlimited
-- sentinel (-1) need a few branches SQL would only obscure.
SELECT
  i.slug AS instance_slug,
  i.name AS instance_name,
  c.name AS customer_name,
  c.slug AS customer_slug,
  e.slug AS entitlement_slug,
  e.name AS entitlement_name,
  e.unit_plural,
  e.warning_threshold_percent::int AS warning_threshold_percent,
  l.name AS license_name,
  l.lifecycle_state::text AS license_state,
  (eu.value->>'value')::double precision AS used,
  (iee.value->>'value')::double precision AS granted,
  COALESCE(iee.limit_cap_exceeded_overage_percent, 0)::int AS overage_percent,
  eu.period_start
FROM entitlement_usage eu
JOIN instance i ON i.id = eu.instance_id
JOIN customer c ON c.id = i.customer_id
JOIN license l ON l.id = i.license_id
JOIN entitlement e ON e.id = eu.entitlement_id
JOIN instance_effective_entitlement iee
  ON iee.instance_id = eu.instance_id AND iee.entitlement_id = eu.entitlement_id
WHERE eu.organization_id = sqlc.arg(organization_id)
  AND e.type IN ('NUMBER', 'NUMBER_AI_CREDIT')
  AND jsonb_typeof(iee.value->'value') = 'number'
  AND jsonb_typeof(eu.value->'value') = 'number';

-- name: DashboardAcceptedReportsPerDay :many
SELECT
  date_trunc('day', ul.reported_at)::timestamp AS day,
  count(*)::bigint AS accepted
FROM usage_ledger ul
WHERE ul.organization_id = sqlc.arg(organization_id)
  AND ul.reported_at >= sqlc.arg(since)
GROUP BY 1
ORDER BY 1;

-- name: DashboardRejectedReportsPerDay :many
SELECT
  date_trunc('day', at.occurred_at AT TIME ZONE 'UTC')::timestamp AS day,
  count(*)::bigint AS rejected
FROM audit_trail at
WHERE at.organization_id = sqlc.arg(organization_id)
  AND at.event_name = 'ENTITLEMENT_USAGE_REPORT_REJECTED'
  AND at.occurred_at >= sqlc.arg(since)
GROUP BY 1
ORDER BY 1;

-- name: DashboardReportsByInstance :many
-- One row per instance: the reports it had accepted and refused in the range,
-- its last accepted report, and its last entitlement read. An instance with
-- neither a report nor a read in the range is silent.
WITH accepted AS (
  SELECT ul.instance_id, count(*)::bigint AS accepted, max(ul.reported_at) AS last_report_at
  FROM usage_ledger ul
  WHERE ul.organization_id = sqlc.arg(organization_id)
    AND ul.reported_at >= sqlc.arg(since)
  GROUP BY ul.instance_id
), refused AS (
  SELECT at.instance_id,
         count(*)::bigint AS rejected,
         count(*) FILTER (WHERE at.occurred_at >= sqlc.arg(last_day))::bigint AS rejected_24h
  FROM audit_trail at
  WHERE at.organization_id = sqlc.arg(organization_id)
    AND at.event_name = 'ENTITLEMENT_USAGE_REPORT_REJECTED'
    AND at.occurred_at >= sqlc.arg(since_tz)
  GROUP BY at.instance_id
), reads AS (
  SELECT at.instance_id, max(at.occurred_at) AS last_read_at
  FROM audit_trail at
  WHERE at.organization_id = sqlc.arg(organization_id)
    AND at.event_name = 'ENTITLEMENT_VALUE_GET'
    AND at.occurred_at >= sqlc.arg(since_tz)
  GROUP BY at.instance_id
)
SELECT
  i.slug,
  i.name,
  c.name AS customer_name,
  c.slug AS customer_slug,
  l.name AS license_name,
  l.lifecycle_state::text AS license_state,
  COALESCE(a.accepted, 0)::bigint AS accepted,
  COALESCE(r.rejected, 0)::bigint AS rejected,
  COALESCE(r.rejected_24h, 0)::bigint AS rejected_24h,
  a.last_report_at::timestamp AS last_report_at,
  rd.last_read_at::timestamptz AS last_read_at
FROM instance i
JOIN customer c ON c.id = i.customer_id
JOIN license l ON l.id = i.license_id
LEFT JOIN accepted a ON a.instance_id = i.id
LEFT JOIN refused r ON r.instance_id = i.id
LEFT JOIN reads rd ON rd.instance_id = i.id
WHERE i.organization_id = sqlc.arg(organization_id)
 
ORDER BY COALESCE(a.accepted, 0) DESC, i.slug;

-- name: DashboardFlagEvaluations :many
-- Evaluations per flag in the range, from the audit trail. A floor rather than
-- a count: the evaluation publisher drops under pressure.
SELECT
  f.slug,
  f.name,
  f.enabled,
  COALESCE(ev.evaluations, 0)::bigint AS evaluations
FROM feature_flags f
LEFT JOIN (
  SELECT at.payload->>'flag_slug' AS slug, count(*)::bigint AS evaluations
  FROM audit_trail at
  WHERE at.organization_id = sqlc.arg(organization_id)
    AND at.event_name = 'FEATURE_FLAG_EVALUATED'
    AND at.occurred_at >= sqlc.arg(since)
  GROUP BY 1
) ev ON ev.slug = f.slug
WHERE f.organization_id = sqlc.arg(organization_id)
ORDER BY COALESCE(ev.evaluations, 0) DESC, f.slug;

-- name: DashboardLicenseMix :many
SELECT
  lf.slug AS family_slug,
  l.slug AS license_slug,
  l.name,
  l.version,
  l.lifecycle_state::text AS lifecycle_state,
  l.is_default,
  count(i.id)::bigint AS instances
FROM license l
JOIN license_family lf ON lf.id = l.family_id
LEFT JOIN instance i ON i.license_id = l.id
WHERE l.organization_id = sqlc.arg(organization_id)
GROUP BY lf.slug, l.id
ORDER BY lf.slug, l.version;

-- name: DashboardLicensesEndingCounts :one
SELECT
  count(*) FILTER (WHERE i.end_license_date < sqlc.arg(in_30_days))::bigint AS within_30_days,
  count(*)::bigint AS within_180_days
FROM instance i
WHERE i.organization_id = sqlc.arg(organization_id)
 
  AND i.end_license_date >= sqlc.arg(now)
  AND i.end_license_date < sqlc.arg(in_180_days);

-- name: DashboardLicensesEnding :many
SELECT
  i.slug,
  i.name,
  c.name AS customer_name,
  c.slug AS customer_slug,
  l.name AS license_name,
  i.end_license_date,
  COALESCE((SELECT ib.status::text FROM instance_billing ib
     WHERE ib.instance_id = i.id ORDER BY ib.created_at DESC LIMIT 1), '')::text AS billing_status
FROM instance i
JOIN customer c ON c.id = i.customer_id
JOIN license l ON l.id = i.license_id
WHERE i.organization_id = sqlc.arg(organization_id)
 
  AND i.end_license_date >= sqlc.arg(now)
  AND i.end_license_date < sqlc.arg(in_180_days)
ORDER BY i.end_license_date
LIMIT 5;

-- name: DashboardArchivedVersions :many
-- Instances pinned to a License version withdrawn from sale, and the version
-- their family serves instead.
SELECT
  i.slug,
  i.name,
  c.name AS customer_name,
  c.slug AS customer_slug,
  l.name AS license_name,
  l.version,
  lf.slug AS family_slug,
  COALESCE((SELECT d.name FROM license d
     WHERE d.family_id = l.family_id AND d.is_default AND d.lifecycle_state = 'PUBLISHED'
     LIMIT 1), '')::text AS default_license_name
FROM instance i
JOIN customer c ON c.id = i.customer_id
JOIN license l ON l.id = i.license_id
JOIN license_family lf ON lf.id = l.family_id
WHERE i.organization_id = sqlc.arg(organization_id)
 
  AND l.lifecycle_state = 'ARCHIVED'
ORDER BY c.name, i.slug;

-- name: DashboardZones :many
-- Each zone with its latest deployment, from the journal, and how many
-- releases were created after the one it runs.
SELECT
  z.slug,
  z.name,
  z.type,
  r.version AS release_version,
  d.created_at AS deployed_at,
  u.name AS deployed_by,
  (SELECT count(*) FROM instance i
     WHERE i.deployment_zone_id = z.id)::bigint AS instances,
  (SELECT count(*) FROM release n
     WHERE n.organization_id = z.organization_id AND n.created_at > r.created_at)::bigint AS releases_behind
FROM deployment_zone z
LEFT JOIN LATERAL (
  SELECT d0.release_id, d0.created_at, d0.created_by_id
  FROM deployment d0
  WHERE d0.deployment_zone_id = z.id
  ORDER BY d0.created_at DESC
  LIMIT 1
) d ON true
LEFT JOIN release r ON r.id = d.release_id
LEFT JOIN "user" u ON u.id = d.created_by_id
WHERE z.organization_id = sqlc.arg(organization_id)
ORDER BY z.name;

-- name: DashboardCredentials :one
SELECT
  (SELECT count(*) FROM "user" u
     WHERE u.organization_id = sqlc.arg(organization_id)::uuid AND u.type = 'machine' AND u.deleted_at IS NULL)::bigint AS service_accounts,
  count(*) FILTER (WHERE t.revoked_date IS NULL AND (t.expires_at IS NULL OR t.expires_at > sqlc.arg(now)))::bigint AS active_tokens,
  count(*) FILTER (WHERE t.revoked_date IS NULL AND t.expires_at IS NOT NULL
                     AND t.expires_at > sqlc.arg(now) AND t.expires_at <= sqlc.arg(in_30_days))::bigint AS tokens_expiring_30_days,
  count(*) FILTER (WHERE t.revoked_date IS NULL AND t.expires_at IS NULL)::bigint AS tokens_without_expiry,
  (SELECT count(*) FROM publishable_key k
     WHERE k.organization_id = sqlc.arg(organization_id)::uuid AND k.revoked_at IS NULL)::bigint AS publishable_keys,
  (SELECT max(k.last_used_at) FROM publishable_key k
     WHERE k.organization_id = sqlc.arg(organization_id)::uuid AND k.revoked_at IS NULL)::timestamp AS publishable_key_last_used_at
FROM token t
WHERE t.organization_id = sqlc.arg(organization_id)::uuid;

-- name: DashboardTokensExpiring :many
SELECT t.name, t.slug, t.expires_at, u.slug AS service_account_slug, u.name AS service_account_name
FROM token t
JOIN "user" u ON u.id = t.service_account_id
WHERE t.organization_id = sqlc.arg(organization_id)::uuid
  AND t.revoked_date IS NULL
  AND t.expires_at IS NOT NULL
  AND t.expires_at > sqlc.arg(now)
  AND t.expires_at <= sqlc.arg(in_30_days)
ORDER BY t.expires_at
LIMIT 5;

-- name: DashboardConnectors :many
SELECT
  c.name,
  (oc.organization_id IS NOT NULL)::boolean AS activated,
  oc.activated_at
FROM connector c
LEFT JOIN organization_connector oc
  ON oc.connector_name = c.name AND oc.organization_id = sqlc.arg(organization_id)
ORDER BY c.name;

-- name: DashboardSubscriptions :one
SELECT
  count(*) FILTER (WHERE ib.status = 'ACTIVE')::bigint AS active,
  count(*) FILTER (WHERE ib.status = 'TRIAL')::bigint AS trial,
  count(*) FILTER (WHERE ib.status = 'PAST_DUE')::bigint AS past_due,
  count(*) FILTER (WHERE ib.status = 'CANCELED')::bigint AS canceled
FROM instance_billing ib
WHERE ib.organization_id = sqlc.arg(organization_id);

-- name: DashboardInvoicedThisMonth :many
-- What Kaiten composed and issued since the start of the calendar month, per
-- currency: drafts and voided invoices are not issued.
SELECT
  inv.currency::text AS currency,
  count(*)::bigint AS invoices,
  COALESCE(sum(inv.total_minor), 0)::bigint AS total_minor,
  count(*) FILTER (WHERE inv.status = 'PAID')::bigint AS paid,
  count(*) FILTER (WHERE inv.status IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED')
                     AND inv.due_at IS NOT NULL AND inv.due_at < sqlc.arg(now))::bigint AS overdue
FROM instance_invoice inv
WHERE inv.organization_id = sqlc.arg(organization_id)
  AND inv.issued_at IS NOT NULL
  AND inv.issued_at >= sqlc.arg(month_start)
  AND inv.status NOT IN ('DRAFT', 'VOID')
GROUP BY inv.currency
ORDER BY total_minor DESC;
