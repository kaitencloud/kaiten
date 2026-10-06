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


-- name: GetPairReportSeq :one
-- The pair's report counter, 0 before its first report. Read by Seal under
-- the pair's lock.
SELECT coalesce((SELECT eu.report_seq FROM entitlement_usage eu
                  WHERE eu.instance_id = sqlc.arg(instance_id)
                    AND eu.entitlement_id = sqlc.arg(entitlement_id)), 0)::bigint AS report_seq;


-- name: SummarizeUsageWindows :many
-- A pair's rows dated in [from, to), summed by reset window, oldest window
-- first. Usage is the counter's own movement; overage is its movement above
-- the limit each row was gated against (0 on an unlimited row). Decimals come
-- out as exact text.
SELECT ul.window_start,
       ul.window_end,
       trim_scale(sum(ul.value_after - ul.value_before))::text AS usage,
       trim_scale(sum(CASE WHEN ul.limit_value IS NULL THEN 0
                           ELSE GREATEST(0, ul.value_after - ul.limit_value)
                              - GREATEST(0, ul.value_before - ul.limit_value)
                      END))::text AS overage,
       count(*)::bigint AS row_count,
       min(ul.report_seq)::bigint AS first_seq,
       max(ul.report_seq)::bigint AS last_seq
FROM usage_ledger ul
WHERE ul.organization_id = sqlc.arg(organization_id)
  AND ul.instance_id = sqlc.arg(instance_id)
  AND ul.entitlement_id = sqlc.arg(entitlement_id)
  AND ul.reported_at >= sqlc.arg(from_at)
  AND ul.reported_at < sqlc.arg(to_at)
GROUP BY ul.window_start, ul.window_end
ORDER BY min(ul.report_seq);


-- name: SummarizeUsageLimits :many
-- The distinct (limit, overage percent) pairs the gate applied to a pair's
-- rows dated in [from, to), in the order they first applied. limit_value is
-- '' when unlimited.
SELECT coalesce(trim_scale(ul.limit_value)::text, '')::text AS limit_value,
       ul.overage_percent,
       count(*)::bigint AS row_count
FROM usage_ledger ul
WHERE ul.organization_id = sqlc.arg(organization_id)
  AND ul.instance_id = sqlc.arg(instance_id)
  AND ul.entitlement_id = sqlc.arg(entitlement_id)
  AND ul.reported_at >= sqlc.arg(from_at)
  AND ul.reported_at < sqlc.arg(to_at)
GROUP BY ul.limit_value, ul.overage_percent
ORDER BY min(ul.report_seq);


-- name: CheckUsageLedgerInvariants :one
-- Everything the journal invariants need about a pair, in one statement so
-- that one snapshot answers them all: a report committing meanwhile cannot
-- make the counter and the journal disagree.
--
--   in_range     the rows dated in [from, to)
--   pred         the row just before the first of them, whatever its date
--   counter      the live counter: its value, window and report_seq
--   tail         the row the counter's report_seq names
--
-- 0 stands for "none" in the seq columns (a report_seq is at least 1), and -1
-- for "no counter" in counter_seq.
--
-- The chain is checked over pred and in_range, between consecutive reports
-- only (a gap is the sequence invariant's to report): a row's value_before
-- must be the previous row's value_after when both are in one window, and the
-- first row of a window opened a day after the journal existed must start at 0.
WITH in_range AS (
  SELECT ul.report_seq, ul.window_start, ul.value_before, ul.value_after
  FROM usage_ledger ul
  WHERE ul.organization_id = sqlc.arg(organization_id)
    AND ul.instance_id = sqlc.arg(instance_id)
    AND ul.entitlement_id = sqlc.arg(entitlement_id)
    AND ul.reported_at >= sqlc.arg(from_at)
    AND ul.reported_at < sqlc.arg(to_at)
),
bounds AS (
  SELECT min(r.report_seq) AS first_seq, max(r.report_seq) AS last_seq, count(*) AS row_count
  FROM in_range r
),
counter AS (
  SELECT eu.report_seq, (eu.value ->> 'value')::numeric AS value, eu.period_start
  FROM entitlement_usage eu
  WHERE eu.instance_id = sqlc.arg(instance_id)
    AND eu.entitlement_id = sqlc.arg(entitlement_id)
),
pred AS (
  SELECT ul.report_seq, ul.window_start, ul.value_before, ul.value_after
  FROM usage_ledger ul, bounds b
  WHERE ul.organization_id = sqlc.arg(organization_id)
    AND ul.instance_id = sqlc.arg(instance_id)
    AND ul.entitlement_id = sqlc.arg(entitlement_id)
    AND ul.report_seq = b.first_seq - 1
),
chain AS (
  SELECT c.report_seq, c.window_start, c.value_before, c.in_period,
         lag(c.report_seq) OVER (ORDER BY c.report_seq) AS prev_seq,
         lag(c.window_start) OVER (ORDER BY c.report_seq) AS prev_window_start,
         lag(c.value_after) OVER (ORDER BY c.report_seq) AS prev_value_after
  FROM (SELECT r.report_seq, r.window_start, r.value_before, r.value_after, TRUE AS in_period FROM in_range r
        UNION ALL
        SELECT p.report_seq, p.window_start, p.value_before, p.value_after, FALSE AS in_period FROM pred p) c
),
tail AS (
  SELECT ul.window_start, ul.value_after
  FROM usage_ledger ul, counter k
  WHERE ul.organization_id = sqlc.arg(organization_id)
    AND ul.instance_id = sqlc.arg(instance_id)
    AND ul.entitlement_id = sqlc.arg(entitlement_id)
    AND ul.report_seq = k.report_seq
)
SELECT
  coalesce(b.first_seq, 0)::bigint AS first_seq,
  coalesce(b.last_seq, 0)::bigint AS last_seq,
  b.row_count::bigint AS row_count,
  coalesce((SELECT k.report_seq FROM counter k), -1)::bigint AS counter_seq,
  coalesce((SELECT trim_scale(k.value)::text FROM counter k), '')::text AS counter_value,
  (SELECT count(DISTINCT ul.report_seq)
     FROM usage_ledger ul, counter k
    WHERE ul.organization_id = sqlc.arg(organization_id)
      AND ul.instance_id = sqlc.arg(instance_id)
      AND ul.entitlement_id = sqlc.arg(entitlement_id)
      AND ul.report_seq BETWEEN b.first_seq AND k.report_seq)::bigint AS seqs_present,
  EXISTS (SELECT 1 FROM pred) AS pred_exists,
  EXISTS (SELECT 1
            FROM usage_ledger ul
           WHERE ul.organization_id = sqlc.arg(organization_id)
             AND ul.instance_id = sqlc.arg(instance_id)
             AND ul.entitlement_id = sqlc.arg(entitlement_id)
             AND ul.report_seq < b.first_seq) AS lower_exists,
  coalesce((SELECT min(c.report_seq) FROM chain c
    WHERE c.in_period
      AND c.prev_seq = c.report_seq - 1
      AND c.prev_window_start IS NOT DISTINCT FROM c.window_start
      AND c.value_before <> c.prev_value_after), 0)::bigint AS first_chain_break,
  coalesce((SELECT min(c.report_seq) FROM chain c, usage_ledger_epoch e
    WHERE c.in_period
      AND c.window_start IS NOT NULL
      AND c.window_start >= e.epoch_at + INTERVAL '24 hours'
      AND ((c.prev_seq IS NULL AND c.report_seq = 1)
           OR (c.prev_seq = c.report_seq - 1 AND c.prev_window_start IS DISTINCT FROM c.window_start))
      AND c.value_before <> 0), 0)::bigint AS first_window_start_break,
  EXISTS (SELECT 1 FROM tail) AS tail_exists,
  coalesce((SELECT t.window_start IS NOT DISTINCT FROM k.period_start FROM tail t, counter k), FALSE)::boolean AS tail_in_counter_window,
  coalesce((SELECT t.value_after = k.value FROM tail t, counter k), FALSE)::boolean AS tail_matches_counter,
  coalesce((SELECT trim_scale(t.value_after)::text FROM tail t), '')::text AS tail_value_after
FROM bounds b;
