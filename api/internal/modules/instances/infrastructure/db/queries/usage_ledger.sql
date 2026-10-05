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
