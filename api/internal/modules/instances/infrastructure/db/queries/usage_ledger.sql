-- name: AppendUsageLedger :exec
-- One row per ACCEPTED report, written by the report transaction right after
-- AcceptEntitlementUsage and under the same lock. The NUMERIC values arrive as
-- decimal strings formatted from the float64 counter, so value_after -
-- value_before is exact.
INSERT INTO usage_ledger (organization_id, instance_id, entitlement_id, license_id,
                          report_seq, reported_at, window_start, window_end,
                          behavior, aggregation_method,
                          reported_value, value_before, value_after, event_count_after,
                          limit_value, overage_percent, transaction_id, properties)
VALUES (sqlc.arg(organization_id), sqlc.arg(instance_id), sqlc.arg(entitlement_id), sqlc.arg(license_id),
        sqlc.arg(report_seq), sqlc.arg(reported_at), sqlc.narg(window_start), sqlc.narg(window_end),
        sqlc.arg(behavior), sqlc.arg(aggregation_method),
        sqlc.arg(reported_value)::text::numeric, sqlc.arg(value_before)::text::numeric,
        sqlc.arg(value_after)::text::numeric, sqlc.arg(event_count_after),
        sqlc.narg(limit_value)::text::numeric, sqlc.arg(overage_percent),
        sqlc.narg(transaction_id), sqlc.narg(properties));


-- name: FindUsageReportByTransactionID :one
-- The idempotency-key lookup: the report a key was last accepted under within
-- [not_before, not_after), run under the pair's lock. same_value compares the
-- values as NUMERIC, so 10 and 10.0 are the same report. not_after is a day
-- past the report's own instant: it keeps the scan off empty future
-- partitions while tolerating a clock that stepped back.
SELECT ul.report_seq,
       ul.reported_at,
       ul.window_start,
       ul.window_end,
       ul.behavior,
       ul.reported_value::text                                   AS reported_value,
       (ul.reported_value = sqlc.arg(value)::text::numeric)::bool AS same_value,
       ul.value_after::float8                                    AS value_after,
       ul.event_count_after,
       -- -1 for an unlimited grant (NULL limit), as the response says it.
       coalesce(ul.limit_value::float8, -1)::float8              AS limit_value,
       ul.license_id,
       l.slug                                                    AS license_slug
FROM usage_ledger ul
LEFT JOIN "license" l
  ON l.id = ul.license_id
 AND l.organization_id = ul.organization_id
WHERE ul.organization_id = sqlc.arg(organization_id)
  AND ul.instance_id = sqlc.arg(instance_id)
  AND ul.entitlement_id = sqlc.arg(entitlement_id)
  AND ul.transaction_id = sqlc.arg(transaction_id)
  AND ul.reported_at >= sqlc.arg(not_before)
  AND ul.reported_at < sqlc.arg(not_after)
ORDER BY ul.reported_at DESC
LIMIT 1;


-- name: ListUsageLedgerPartitions :many
-- The partitions attached to usage_ledger, by name. A table named like one but
-- detached is not listed: it holds no rows anybody reads.
SELECT c.relname::text AS name
FROM pg_catalog.pg_inherits i
JOIN pg_catalog.pg_class c ON c.oid = i.inhrelid
WHERE i.inhparent = 'usage_ledger'::regclass
ORDER BY c.relname;


-- name: ListUsageLedgerOrganizations :many
-- Every organization with at least one journal row, without reading the rows:
-- a loose index scan that jumps from one organization_id to the next on
-- idx_usage_ledger_org_reported_at, one probe per organization.
WITH RECURSIVE orgs AS (
  (SELECT ul.organization_id FROM usage_ledger ul ORDER BY ul.organization_id LIMIT 1)
  UNION ALL
  SELECT (SELECT ul.organization_id FROM usage_ledger ul
           WHERE ul.organization_id > orgs.organization_id
           ORDER BY ul.organization_id LIMIT 1)
  FROM orgs
  WHERE orgs.organization_id IS NOT NULL
)
SELECT orgs.organization_id::uuid AS organization_id FROM orgs WHERE orgs.organization_id IS NOT NULL;


-- name: PurgeOrganizationUsageLedger :execrows
-- One batch of an organization's journal rows older than cutoff, through
-- idx_usage_ledger_org_reported_at. The caller repeats it until a batch comes
-- back short.
DELETE FROM usage_ledger ul
USING (
  SELECT old.instance_id, old.entitlement_id, old.report_seq, old.reported_at
  FROM usage_ledger old
  WHERE old.organization_id = sqlc.arg(organization_id)
    AND old.reported_at < sqlc.arg(cutoff)
  LIMIT sqlc.arg(batch_size)
) doomed
WHERE ul.instance_id = doomed.instance_id
  AND ul.entitlement_id = doomed.entitlement_id
  AND ul.report_seq = doomed.report_seq
  AND ul.reported_at = doomed.reported_at;


-- name: ResolveUsageReportPair :one
-- The instance and entitlement a usage history request names, in one round
-- trip: the nil UUID for a slug the organization does not have. Neither has
-- to be granted by the instance's current licence -- its history outlives a
-- licence change.
SELECT
  coalesce((SELECT i.id FROM instance i
             WHERE i.organization_id = sqlc.arg(organization_id) AND i.slug = sqlc.arg(instance_slug)),
           '00000000-0000-0000-0000-000000000000')::uuid AS instance_id,
  coalesce((SELECT e.id FROM entitlement e
             WHERE e.organization_id = sqlc.arg(organization_id) AND e.slug = sqlc.arg(entitlement_slug)),
           '00000000-0000-0000-0000-000000000000')::uuid AS entitlement_id;


-- name: ListPairUsageReports :many
-- One page of a pair's journal, in report_seq order, through the primary key.
-- Decimals come out as their exact text, limit_value as '' when unlimited (a
-- cast hides its nullability from sqlc); delta and overage_delta are computed
-- here, in NUMERIC, so they are as exact as the columns. trim_scale drops the
-- trailing zeros a subtraction of two scales leaves (2.5 - 0.5 is 2, not 2.0).
SELECT ul.organization_id, ul.instance_id, ul.entitlement_id, ul.license_id,
       ul.report_seq, ul.reported_at, ul.window_start, ul.window_end,
       ul.behavior::text AS behavior, ul.aggregation_method::text AS aggregation_method,
       ul.reported_value::text AS reported_value,
       ul.value_before::text AS value_before,
       ul.value_after::text AS value_after,
       trim_scale(ul.value_after - ul.value_before)::text AS delta,
       (CASE WHEN ul.limit_value IS NULL THEN 0
             ELSE trim_scale(GREATEST(0, ul.value_after - ul.limit_value) - GREATEST(0, ul.value_before - ul.limit_value))
        END)::text AS overage_delta,
       ul.event_count_after, coalesce(ul.limit_value::text, '')::text AS limit_value, ul.overage_percent,
       ul.transaction_id, ul.properties
FROM usage_ledger ul
WHERE ul.organization_id = sqlc.arg(organization_id)
  AND ul.instance_id = sqlc.arg(instance_id)
  AND ul.entitlement_id = sqlc.arg(entitlement_id)
  AND ul.reported_at >= sqlc.arg(from_at)
  AND ul.reported_at < sqlc.arg(to_at)
  AND ul.report_seq > sqlc.arg(after_seq)
  AND (sqlc.narg(transaction_id)::text IS NULL OR ul.transaction_id = sqlc.narg(transaction_id)::text)
ORDER BY ul.report_seq
LIMIT sqlc.arg(page_size);


-- name: ListOrganizationUsageReports :many
-- One page of an organization's journal, every pair or a filtered few, in
-- (reported_at, instance_id, entitlement_id, report_seq) order through
-- idx_usage_ledger_org_reported_at. The ID filters reach a deleted instance or
-- entitlement, whose rows survive it. Same columns as ListPairUsageReports.
SELECT ul.organization_id, ul.instance_id, ul.entitlement_id, ul.license_id,
       ul.report_seq, ul.reported_at, ul.window_start, ul.window_end,
       ul.behavior::text AS behavior, ul.aggregation_method::text AS aggregation_method,
       ul.reported_value::text AS reported_value,
       ul.value_before::text AS value_before,
       ul.value_after::text AS value_after,
       trim_scale(ul.value_after - ul.value_before)::text AS delta,
       (CASE WHEN ul.limit_value IS NULL THEN 0
             ELSE trim_scale(GREATEST(0, ul.value_after - ul.limit_value) - GREATEST(0, ul.value_before - ul.limit_value))
        END)::text AS overage_delta,
       ul.event_count_after, coalesce(ul.limit_value::text, '')::text AS limit_value, ul.overage_percent,
       ul.transaction_id, ul.properties
FROM usage_ledger ul
WHERE ul.organization_id = sqlc.arg(organization_id)
  AND ul.reported_at >= sqlc.arg(from_at)
  AND ul.reported_at < sqlc.arg(to_at)
  AND (sqlc.narg(instance_id)::uuid IS NULL OR ul.instance_id = sqlc.narg(instance_id)::uuid)
  AND (sqlc.narg(entitlement_id)::uuid IS NULL OR ul.entitlement_id = sqlc.narg(entitlement_id)::uuid)
  AND (ul.reported_at, ul.instance_id, ul.entitlement_id, ul.report_seq)
      > (sqlc.arg(after_reported_at)::timestamp, sqlc.arg(after_instance_id)::uuid,
         sqlc.arg(after_entitlement_id)::uuid, sqlc.arg(after_seq)::bigint)
ORDER BY ul.reported_at, ul.instance_id, ul.entitlement_id, ul.report_seq
LIMIT sqlc.arg(page_size);
