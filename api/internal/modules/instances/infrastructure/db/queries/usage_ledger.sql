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
