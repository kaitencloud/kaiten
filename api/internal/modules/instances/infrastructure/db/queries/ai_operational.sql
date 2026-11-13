-- name: GetUsageTargetType :one
-- Attempt accounting needs the original catalogue type before validation or
-- pair-loading failures. This is query-only, organization-scoped, and does not
-- read grants, prices, operations, reservations or usage counters.
SELECT e.type FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id) AND e.slug = sqlc.arg(slug);
