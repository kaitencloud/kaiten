-- name: CreateAddonFamily :one
-- A family is opened by its first version and outlives every one of them,
-- like a licence family.
INSERT INTO addon_family (organization_id, slug)
VALUES (sqlc.arg(organization_id), sqlc.arg(slug))
RETURNING *;


-- name: LockAddonFamilyBySlug :one
-- Serializes the versions created in one family; last_version + 1 is the
-- number update_addon_version() then assigns.
SELECT *
FROM addon_family
WHERE organization_id = sqlc.arg(organization_id)
  AND slug = sqlc.arg(slug)
FOR UPDATE;


-- name: LockAddonFamilyByID :one
SELECT *
FROM addon_family
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id)
FOR UPDATE;


-- name: GetAddonFamilyBySlug :one
SELECT *
FROM addon_family
WHERE organization_id = sqlc.arg(organization_id)
  AND slug = sqlc.arg(slug);


-- name: ListAddonFamilies :many
SELECT *
FROM addon_family
WHERE organization_id = sqlc.arg(organization_id)
ORDER BY created_at DESC, id DESC;


-- name: SetAddonFamilyPublic :one
UPDATE addon_family
SET is_public = sqlc.arg(is_public)
WHERE organization_id = sqlc.arg(organization_id)
  AND slug = sqlc.arg(slug)
RETURNING *;


-- name: InsertAddon :one
-- version is assigned by update_addon_version(); the 0 passed here is
-- overwritten before the row is written.
INSERT INTO addon (organization_id, family_id, name, slug, description, version, version_name, is_default,
                   lifecycle_state, pricing_type, max_quantity, created_by_id, updated_by_id)
VALUES (sqlc.arg(organization_id), sqlc.arg(family_id), sqlc.arg(name), sqlc.arg(slug), sqlc.arg(description), 0,
        sqlc.narg(version_name), sqlc.arg(is_default), sqlc.arg(lifecycle_state), sqlc.arg(pricing_type),
        sqlc.narg(max_quantity), sqlc.arg(user_id), sqlc.arg(user_id))
RETURNING *;


-- name: ClearAddonFamilyDefault :exec
-- Unsets the family's default, but for the version keeping or taking it.
UPDATE addon
SET is_default    = FALSE,
    updated_at    = CURRENT_TIMESTAMP,
    updated_by_id = sqlc.arg(user_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND family_id = sqlc.arg(family_id)
  AND is_default
  AND id <> sqlc.arg(except_id);


-- name: GetAddonBySlug :one
SELECT a.*, f.slug AS family_slug
FROM addon a
JOIN addon_family f ON f.id = a.family_id AND f.organization_id = a.organization_id
WHERE a.organization_id = sqlc.arg(organization_id)
  AND a.slug = sqlc.arg(slug);


-- name: LockAddonBySlug :one
-- Locks the version a write names, after its family: the order every version
-- write takes, so they never deadlock one another.
WITH family AS (
  SELECT f.id, f.slug
  FROM addon_family f
  JOIN addon a0 ON a0.family_id = f.id AND a0.organization_id = f.organization_id
  WHERE a0.organization_id = sqlc.arg(organization_id)
    AND a0.slug = sqlc.arg(slug)
  FOR UPDATE OF f
)
SELECT a.*, family.slug AS family_slug
FROM addon a
JOIN family ON family.id = a.family_id
WHERE a.organization_id = sqlc.arg(organization_id)
  AND a.slug = sqlc.arg(slug)
FOR NO KEY UPDATE OF a;


-- name: ListAddons :many
SELECT a.*, f.slug AS family_slug
FROM addon a
JOIN addon_family f ON f.id = a.family_id AND f.organization_id = a.organization_id
WHERE a.organization_id = sqlc.arg(organization_id)
  AND (sqlc.narg(lifecycle_state)::license_lifecycle_state IS NULL OR a.lifecycle_state = sqlc.narg(lifecycle_state))
  AND (sqlc.narg(family_slug)::text IS NULL OR f.slug = sqlc.narg(family_slug))
  AND (sqlc.narg(cursor_at)::timestamp IS NULL
    OR (a.created_at, a.id) < (sqlc.narg(cursor_at)::timestamp, sqlc.narg(cursor_id)::uuid))
ORDER BY a.created_at DESC, a.id DESC
LIMIT sqlc.narg(row_limit)::integer;


-- name: ListAddonsByFamilyIDs :many
SELECT a.*, f.slug AS family_slug
FROM addon a
JOIN addon_family f ON f.id = a.family_id AND f.organization_id = a.organization_id
WHERE a.organization_id = sqlc.arg(organization_id)
  AND a.family_id = ANY (sqlc.arg(family_ids)::uuid[])
ORDER BY a.version DESC;


-- name: UpdateAddon :one
UPDATE addon
SET name          = sqlc.arg(name),
    description   = sqlc.arg(description),
    version_name  = sqlc.arg(version_name),
    is_default    = sqlc.arg(is_default),
    max_quantity  = sqlc.narg(max_quantity),
    updated_at    = CURRENT_TIMESTAMP,
    updated_by_id = sqlc.arg(user_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id)
RETURNING *;


-- name: SetAddonLifecycleState :one
UPDATE addon
SET lifecycle_state = sqlc.arg(state),
    updated_at      = CURRENT_TIMESTAMP,
    updated_by_id   = sqlc.arg(user_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id)
RETURNING *;


-- name: DeleteAddon :exec
DELETE
FROM addon
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id);


-- name: DeleteAddonFamilyIfEmpty :exec
-- A family goes with its last version, which frees its slug.
DELETE
FROM addon_family f
WHERE f.organization_id = sqlc.arg(organization_id)
  AND f.id = sqlc.arg(id)
  AND NOT EXISTS (SELECT 1 FROM addon a WHERE a.family_id = f.id);


-- name: AddonIsBilled :one
-- Whether a live subscription bills an instance holding this version: what
-- the version sells is frozen then.
SELECT EXISTS (SELECT 1
               FROM instance_addon ia
               JOIN instance_billing ib
                 ON ib.instance_id = ia.instance_id AND ib.organization_id = ia.organization_id
               WHERE ia.organization_id = sqlc.arg(organization_id)
                 AND ia.addon_id = sqlc.arg(addon_id)
                 AND ia.removed_at IS NULL
                 AND ib.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE'))::boolean AS billed;


-- name: AddonWasAttached :one
SELECT EXISTS (SELECT 1
               FROM instance_addon ia
               WHERE ia.organization_id = sqlc.arg(organization_id)
                 AND ia.addon_id = sqlc.arg(addon_id))::boolean AS attached;


-- name: InsertAddonPrice :one
INSERT INTO addon_price (organization_id, addon_id, billing_model, billing_timing, billing_period,
                         unit_amount_decimal, currency, meters_entitlement_id, sale_unit_factor, display_label,
                         display_order, is_default, created_by_id, updated_by_id)
VALUES (sqlc.arg(organization_id), sqlc.arg(addon_id), sqlc.arg(billing_model), sqlc.arg(billing_timing),
        sqlc.narg(billing_period), CAST(sqlc.arg(unit_amount_decimal)::text AS NUMERIC), sqlc.arg(currency),
        sqlc.narg(meters_entitlement_id), CAST(sqlc.narg(sale_unit_factor)::text AS NUMERIC), sqlc.narg(display_label),
        sqlc.arg(display_order), sqlc.arg(is_default), sqlc.arg(user_id), sqlc.arg(user_id))
RETURNING id;


-- name: ClearAddonPriceDefault :exec
UPDATE addon_price
SET is_default    = FALSE,
    updated_at    = CURRENT_TIMESTAMP,
    updated_by_id = sqlc.arg(user_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND addon_id = sqlc.arg(addon_id)
  AND billing_period = sqlc.arg(billing_period)::billing_period
  AND is_default;


-- name: ListAddonPrices :many
SELECT p.id, p.addon_id, p.billing_model, p.billing_timing, p.billing_period,
       p.unit_amount_decimal::text AS unit_amount_decimal, p.currency::text AS currency, p.meters_entitlement_id,
       coalesce(p.sale_unit_factor::text, '')::text AS sale_unit_factor, e.slug AS entitlement_slug,
       e.sale_unit_singular, e.sale_unit_plural, p.display_label, p.display_order, p.is_default, p.status,
       p.deprecated_at, p.created_at, p.updated_at
FROM addon_price p
LEFT JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id
WHERE p.organization_id = sqlc.arg(organization_id)
  AND p.addon_id = ANY (sqlc.arg(addon_ids)::uuid[])
  AND (sqlc.narg(status)::price_status IS NULL OR p.status = sqlc.narg(status))
ORDER BY p.display_order, p.id;


-- name: LockAddonPrice :one
SELECT p.id, p.status, p.is_default
FROM addon_price p
WHERE p.organization_id = sqlc.arg(organization_id)
  AND p.addon_id = sqlc.arg(addon_id)
  AND p.id = sqlc.arg(id)
FOR UPDATE;


-- name: DeprecateAddonPrice :exec
UPDATE addon_price
SET status        = 'DEPRECATED',
    deprecated_at = CURRENT_TIMESTAMP,
    updated_at    = CURRENT_TIMESTAMP,
    updated_by_id = sqlc.arg(user_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id);


-- name: GetAddonPricingEntitlement :one
-- The entitlement a metered add-on price names, with the version's grant of it.
SELECT e.id, e.type, e.reset_period, e.aggregation_method,
       coalesce(e.sale_unit_factor::text, '')::text AS sale_unit_factor,
       ae.value AS grant_value, ae.limit_cap_exceeded_overage_percent AS grant_overage_percent
FROM entitlement e
LEFT JOIN addon_entitlement ae
  ON ae.entitlement_id = e.id AND ae.addon_id = sqlc.arg(addon_id) AND ae.organization_id = e.organization_id
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.slug = sqlc.arg(slug);


-- name: CountOtherActiveMeteredAddonPrices :one
SELECT count(*)::integer
FROM addon_price p
WHERE p.addon_id = sqlc.arg(addon_id)
  AND p.meters_entitlement_id = sqlc.arg(entitlement_id)
  AND p.status = 'ACTIVE'
  AND p.id <> sqlc.arg(except_id);


-- name: GetEntitlementBySlug :one
SELECT e.id, e.slug, e.type
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.slug = sqlc.arg(slug);


-- name: InsertAddonEntitlement :one
INSERT INTO addon_entitlement (organization_id, addon_id, entitlement_id, value, limit_cap_exceeded_overage_percent,
                               override_behavior, created_by_id, updated_by_id)
VALUES (sqlc.arg(organization_id), sqlc.arg(addon_id), sqlc.arg(entitlement_id), sqlc.arg(value),
        sqlc.narg(overage_percent), sqlc.arg(override_behavior), sqlc.arg(user_id), sqlc.arg(user_id))
RETURNING id;


-- name: ListAddonEntitlements :many
SELECT ae.id, ae.value, ae.limit_cap_exceeded_overage_percent, ae.override_behavior, ae.entitlement_id,
       e.slug AS entitlement_slug, e.type AS entitlement_type
FROM addon_entitlement ae
JOIN entitlement e ON e.id = ae.entitlement_id AND e.organization_id = ae.organization_id
WHERE ae.organization_id = sqlc.arg(organization_id)
  AND ae.addon_id = sqlc.arg(addon_id)
  AND (sqlc.narg(entitlement_slug)::text IS NULL OR e.slug = sqlc.narg(entitlement_slug))
ORDER BY e.slug;


-- name: UpdateAddonEntitlement :exec
UPDATE addon_entitlement
SET value                              = sqlc.arg(value),
    limit_cap_exceeded_overage_percent = sqlc.narg(overage_percent),
    override_behavior                  = sqlc.arg(override_behavior),
    updated_at                         = CURRENT_TIMESTAMP,
    updated_by_id                      = sqlc.arg(user_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id);


-- name: DeleteAddonEntitlement :exec
DELETE
FROM addon_entitlement
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id);


-- name: EntitlementMeteredByAddonPrice :one
SELECT EXISTS (SELECT 1
               FROM addon_price p
               WHERE p.addon_id = sqlc.arg(addon_id)
                 AND p.meters_entitlement_id = sqlc.arg(entitlement_id)
                 AND p.status = 'ACTIVE')::boolean AS metered;


-- name: ListAddonCompatibleFamilies :many
SELECT lf.slug
FROM addon_compatible_license c
JOIN license_family lf ON lf.id = c.license_family_id AND lf.organization_id = c.organization_id
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.addon_id = sqlc.arg(addon_id)
ORDER BY lf.slug;


-- name: GetLicenseFamilyIDBySlug :one
SELECT id
FROM license_family
WHERE organization_id = sqlc.arg(organization_id)
  AND slug = sqlc.arg(slug);


-- name: InsertAddonCompatibility :exec
INSERT INTO addon_compatible_license (addon_id, license_family_id, organization_id)
VALUES (sqlc.arg(addon_id), sqlc.arg(license_family_id), sqlc.arg(organization_id))
ON CONFLICT DO NOTHING;


-- name: DeleteAddonCompatibility :exec
DELETE
FROM addon_compatible_license
WHERE organization_id = sqlc.arg(organization_id)
  AND addon_id = sqlc.arg(addon_id)
  AND license_family_id = sqlc.arg(license_family_id);
