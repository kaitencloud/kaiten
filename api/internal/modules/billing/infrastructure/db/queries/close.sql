-- name: ListDueSubscriptions :many
-- The live subscriptions whose period ended at or before due_before, oldest
-- boundary first, optionally one organization or one instance's, skipping
-- those a pass already gave up on.
SELECT ib.id, ib.organization_id
FROM instance_billing ib
WHERE ib.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
  AND ib.current_period_end <= sqlc.arg(due_before)
  AND (sqlc.narg(organization_id)::uuid IS NULL OR ib.organization_id = sqlc.narg(organization_id)::uuid)
  AND (sqlc.narg(instance_id)::uuid IS NULL OR ib.instance_id = sqlc.narg(instance_id)::uuid)
  AND NOT (ib.id = ANY (sqlc.arg(excluded)::uuid[]))
ORDER BY ib.current_period_end, ib.id
LIMIT sqlc.arg(page_size);


-- name: GetSubscriptionByID :one
SELECT *
FROM instance_billing ib
WHERE ib.id = sqlc.arg(id);


-- name: LockDueSubscription :one
-- The subscription a close works on, locked; no row when another close or a
-- use case holds it, which the close takes as "not now" rather than waiting.
SELECT *
FROM instance_billing ib
WHERE ib.id = sqlc.arg(id)
FOR UPDATE SKIP LOCKED;


-- name: RefreshSubscriptionSnapshot :one
-- Brings the identity a subscription snapshots (instance and customer slugs and
-- names) up to the live instance and customer, so the invoice a close issues
-- carries today's names and not those of subscribe time. A deleted instance or
-- customer keeps its last snapshot.
UPDATE instance_billing ib
SET instance_slug = coalesce(i.slug, ib.instance_slug),
    instance_name = coalesce(i.name, ib.instance_name),
    customer_slug = coalesce(c.slug, ib.customer_slug),
    customer_name = coalesce(c.name, ib.customer_name)
FROM (SELECT sqlc.arg(id)::uuid AS id) target
LEFT JOIN instance i ON i.id = (SELECT x.instance_id FROM instance_billing x WHERE x.id = target.id)
LEFT JOIN customer c ON c.id = (SELECT x.customer_id FROM instance_billing x WHERE x.id = target.id)
WHERE ib.id = target.id
RETURNING ib.*;


-- name: AdvanceSubscriptionPeriod :exec
UPDATE instance_billing
SET current_period_start = sqlc.arg(period_start),
    current_period_end   = sqlc.arg(period_end),
    updated_by_id        = sqlc.arg(user_id),
    updated_at           = sqlc.arg(now)
WHERE id = sqlc.arg(id);


-- name: GetPreviousInvoiceLines :one
-- The lines of a subscription's latest live invoice before a boundary: the
-- previous close, whose usage fingerprints the next period starts after.
SELECT i.lines
FROM instance_invoice i
WHERE i.instance_billing_id = sqlc.arg(instance_billing_id)
  AND i.status <> 'VOID'
  AND i.boundary_at < sqlc.arg(boundary_at)
ORDER BY i.boundary_at DESC, i.created_at DESC
LIMIT 1;


-- name: GetSystemActor :one
-- system:kaiten's membership in an organization: the user work Kaiten does on
-- its own behalf is recorded under. No row when it has none.
SELECT u.id
FROM "user" u
JOIN user_on_organization m
  ON m.user_id = u.id
 AND m.organization_id = sqlc.arg(organization_id)
 AND m.deleted_at IS NULL
WHERE u.external_id = sqlc.arg(external_id);
