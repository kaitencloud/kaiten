-- name: GetEntitlements :many
-- Unbounded on purpose: also used by the entitlement-by-slug GraphQL
-- dataloader and the feature-flags entitlement catalogue, both of which
-- batch-load the organization's whole catalog once per request.
-- GetEntitlementsByCursor (below) is the cursor-paginated variant for
-- list-facing callers (REST getentitlements, GraphQL Query.entitlements).
SELECT e.id,
       e.name,
       e.slug,
       e.description,
       e.type,
       e.aggregation_method,
       e.organization_id,
       e.icon,
       e.unit_singular,
       e.unit_plural,
       e.sale_unit_singular,
       e.sale_unit_plural,
       e.sale_unit_factor,
       e.user_facing,
       e.display_order,
       e.warning_threshold_percent,
       e.reset_period,
       e.reset_anchor,
       e.created_at,
       e.updated_at
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id);


-- name: GetEntitlementsByCursor :many
-- Cursor (keyset) pagination: ordered by created_at DESC, id DESC (id
-- tie-breaks created_at, which is not guaranteed unique). Pass
-- limit_plus_one = requested limit + 1 so the caller can detect whether a
-- further page exists without a separate COUNT query. On the first page,
-- pass NULL for both cursor_created_at and cursor_id.
SELECT e.id,
       e.name,
       e.slug,
       e.description,
       e.type,
       e.aggregation_method,
       e.organization_id,
       e.icon,
       e.unit_singular,
       e.unit_plural,
       e.sale_unit_singular,
       e.sale_unit_plural,
       e.sale_unit_factor,
       e.user_facing,
       e.display_order,
       e.warning_threshold_percent,
       e.reset_period,
       e.reset_anchor,
       e.created_at,
       e.updated_at
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (e.created_at, e.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY e.created_at DESC, e.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: CreateEntitlement :one
INSERT INTO entitlement (name, slug, description, type, aggregation_method, organization_id, icon,
                         unit_singular, unit_plural, sale_unit_singular, sale_unit_plural, sale_unit_factor, user_facing,
                         display_order, warning_threshold_percent, reset_period, reset_anchor)
VALUES ($1, $2, $3, $4, $5, sqlc.arg(organization_id), sqlc.arg(icon),
        sqlc.arg(unit_singular), sqlc.arg(unit_plural), sqlc.arg(sale_unit_singular), sqlc.arg(sale_unit_plural),
        sqlc.arg(sale_unit_factor), sqlc.arg(user_facing), sqlc.arg(display_order),
        sqlc.arg(warning_threshold_percent),
        sqlc.arg(reset_period), sqlc.arg(reset_anchor))
RETURNING *;


-- name: GetEntitlement :one
SELECT e.id,
       e.name,
       e.slug,
       e.description,
       e.type,
       e.aggregation_method,
       e.organization_id,
       e.icon,
       e.unit_singular,
       e.unit_plural,
       e.sale_unit_singular,
       e.sale_unit_plural,
       e.sale_unit_factor,
       e.user_facing,
       e.display_order,
       e.warning_threshold_percent,
       e.reset_period,
       e.reset_anchor,
       e.created_at,
       e.updated_at
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.slug = sqlc.arg(slug);


-- name: UpdateEntitlement :one
-- reset_period/reset_anchor are a one-way door (see the entitlement schema
-- package's immutability check, enforced before this query runs): COALESCE
-- means the SET is only ever effective the first time, when the stored
-- value is still NULL -- once set, this UPDATE can never change it again,
-- even defensively if a caller somehow bypassed the application check.
UPDATE entitlement e
SET name               = $1,
    description        = $2,
    icon               = sqlc.arg(icon),
    unit_singular      = sqlc.arg(unit_singular),
    unit_plural        = sqlc.arg(unit_plural),
    sale_unit_singular = sqlc.arg(sale_unit_singular),
    sale_unit_plural   = sqlc.arg(sale_unit_plural),
    sale_unit_factor   = sqlc.arg(sale_unit_factor),
    user_facing        = sqlc.arg(user_facing),
    display_order      = sqlc.arg(display_order),
    warning_threshold_percent = sqlc.arg(warning_threshold_percent),
    reset_period       = COALESCE(e.reset_period, sqlc.arg(reset_period)),
    reset_anchor       = COALESCE(e.reset_anchor, sqlc.arg(reset_anchor)),
    updated_at         = now()
WHERE e.slug = sqlc.arg(slug)
  AND e.organization_id = sqlc.arg(organization_id)
RETURNING e.*;


-- name: DeleteEntitlement :one
DELETE
FROM entitlement e
WHERE e.slug = sqlc.arg(slug)
  AND e.organization_id = sqlc.arg(organization_id)
RETURNING e.*;


-- name: GetEntitlementBySlug :one
SELECT e.id,
       e.name,
       e.slug,
       e.description,
       e.type,
       e.aggregation_method,
       e.organization_id,
       e.icon,
       e.unit_singular,
       e.unit_plural,
       e.sale_unit_singular,
       e.sale_unit_plural,
       e.sale_unit_factor,
       e.user_facing,
       e.display_order,
       e.warning_threshold_percent,
       e.reset_period,
       e.reset_anchor,
       e.created_at,
       e.updated_at
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.slug = sqlc.arg(entitlement_slug);
