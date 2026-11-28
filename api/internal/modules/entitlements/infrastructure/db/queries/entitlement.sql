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
       e.updated_at,
       e.usage_source
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
       e.updated_at,
       e.usage_source
FROM entitlement e
WHERE (NOT sqlc.arg(hide_ai)::boolean OR e.type <> 'NUMBER_AI_CREDIT')
 AND e.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (e.created_at, e.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY e.created_at DESC, e.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: CreateEntitlement :one
-- usage_source is the column's default (CALCULATED_USAGE) when the caller names
-- none: a writer that knows nothing of combined entitlements keeps working.
INSERT INTO entitlement (name, slug, description, type, aggregation_method, organization_id, icon,
                         unit_singular, unit_plural, sale_unit_singular, sale_unit_plural, sale_unit_factor, user_facing,
                         display_order, warning_threshold_percent, reset_period, reset_anchor, usage_source)
VALUES ($1, $2, $3, $4, $5, sqlc.arg(organization_id), sqlc.arg(icon),
        sqlc.arg(unit_singular), sqlc.arg(unit_plural), sqlc.arg(sale_unit_singular), sqlc.arg(sale_unit_plural),
        sqlc.arg(sale_unit_factor), sqlc.arg(user_facing), sqlc.arg(display_order),
        sqlc.arg(warning_threshold_percent),
        sqlc.arg(reset_period), sqlc.arg(reset_anchor),
        COALESCE(sqlc.narg(usage_source)::entitlement_usage_source, 'CALCULATED_USAGE'))
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
       e.updated_at,
       e.usage_source
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
       e.updated_at,
       e.usage_source
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.slug = sqlc.arg(entitlement_slug);


-- name: CountEntitlementReferences :one
-- What still holds an entitlement a delete was refused for: every foreign key
-- onto entitlement that restricts the delete, and the combined entitlements it
-- is a source of (a link row cascades, so the delete use case refuses on it
-- itself). Its usage is not among them: entitlement_usage follows the
-- entitlement out (20261012000000_entitlement_usage_follows_its_entitlement.sql).
SELECT
  (SELECT count(*) FROM license_entitlement le WHERE le.entitlement_id = e.id)::int AS license_grants,
  (SELECT count(*) FROM license_price p WHERE p.meters_entitlement_id = e.id)::int AS license_prices,
  (SELECT count(*) FROM addon_price ap WHERE ap.meters_entitlement_id = e.id)::int AS addon_prices,
  (SELECT count(*) FROM addon_entitlement ae WHERE ae.entitlement_id = e.id)::int AS addon_grants,
  (SELECT count(*) FROM voucher_entitlement_grant vg WHERE vg.entitlement_id = e.id)::int AS boost_grants,
  (SELECT count(*) FROM entitlement_source es WHERE es.source_entitlement_id = e.id)::int AS combined_entitlements
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.slug = sqlc.arg(slug);


-- name: ListCombinedSources :many
-- The sources of the organization's combined entitlements, each with its weight
-- as exact text (trim_scale drops the zeros of NUMERIC(18,10): 0.4, not
-- 0.4000000000): every combined entitlement of the organization, or the one
-- named combined_slug. Alphabetical by source slug: nothing orders them in
-- storage.
SELECT c.id   AS combined_id,
       c.slug AS combined_slug,
       s.slug AS source_slug,
       trim_scale(es.weight)::text AS weight
FROM entitlement_source es
JOIN entitlement c ON c.id = es.combined_entitlement_id AND c.organization_id = es.organization_id
JOIN entitlement s ON s.id = es.source_entitlement_id AND s.organization_id = es.organization_id
WHERE es.organization_id = sqlc.arg(organization_id)
  AND (sqlc.narg(combined_slug)::text IS NULL OR c.slug = sqlc.narg(combined_slug))
ORDER BY c.slug, s.slug;


-- name: ListCombinedOfSource :many
-- The slugs of the combined entitlements an entitlement is a source of.
SELECT c.slug
FROM entitlement_source es
JOIN entitlement c ON c.id = es.combined_entitlement_id AND c.organization_id = es.organization_id
JOIN entitlement s ON s.id = es.source_entitlement_id AND s.organization_id = es.organization_id
WHERE es.organization_id = sqlc.arg(organization_id)
  AND s.slug = sqlc.arg(source_slug)
ORDER BY c.slug;


-- name: LockSourceEntitlements :many
-- What a combined entitlement would sum, share-locked in id order until the
-- transaction ends: nobody changes a source's type, window or existence under
-- the write that checks them, and a source cannot adopt a reset period or be
-- deleted before this write has stored its link.
SELECT e.id, e.slug, e.type, e.aggregation_method, e.usage_source, e.reset_period, e.reset_anchor
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.slug = ANY (sqlc.arg(slugs)::text[])
ORDER BY e.id
FOR SHARE;


-- name: LockEntitlementForUpdate :one
-- The entitlement's row, locked: taken before asking whether it is a source, so
-- the answer is read after any combined entitlement that was storing a link to
-- it has committed (READ COMMITTED sees what committed while the lock was waited
-- for).
SELECT e.id, e.usage_source
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.slug = sqlc.arg(slug)
FOR UPDATE;


-- name: InsertEntitlementSource :exec
INSERT INTO entitlement_source (organization_id, combined_entitlement_id, source_entitlement_id, weight)
VALUES (sqlc.arg(organization_id), sqlc.arg(combined_entitlement_id), sqlc.arg(source_entitlement_id),
        CAST(sqlc.arg(weight)::text AS NUMERIC));


-- name: DeleteEntitlementSources :exec
DELETE FROM entitlement_source es
WHERE es.organization_id = sqlc.arg(organization_id)
  AND es.combined_entitlement_id = sqlc.arg(combined_entitlement_id);


-- name: SetCombinedEntitlementWindow :exec
-- A combined entitlement's window is the one its sources share: derived, not
-- chosen. It is rewritten with the sources, past UpdateEntitlement's one-way
-- door, because nothing is stored for a combined entitlement that a new window
-- could orphan.
UPDATE entitlement e
SET reset_period = sqlc.narg(reset_period),
    reset_anchor = sqlc.narg(reset_anchor),
    updated_at   = now()
WHERE e.id = sqlc.arg(id)
  AND e.organization_id = sqlc.arg(organization_id)
  AND e.usage_source = 'COMBINED_USAGE';
