-- The public catalogue: what a publishable key may read. Every query is
-- scoped by organization and reaches only families marked is_public, and only
-- their default version -- which a CHECK keeps PUBLISHED. Nothing here returns
-- an author, an instance or a customer.


-- name: ListPublicPlans :many
-- One row per public licence family: its default version.
SELECT l.id,
       f.slug AS family_slug,
       l.slug,
       l.name,
       l.description,
       l.lifecycle_state,
       l.pricing_type,
       l.trial_period_days,
       l.requires_payment_method,
       l.self_serve_cta_url
FROM license l
JOIN license_family f ON f.id = l.family_id AND f.organization_id = l.organization_id
WHERE l.organization_id = sqlc.arg(organization_id)
  AND f.is_public
  AND l.is_default
  AND l.lifecycle_state = 'PUBLISHED'
  AND (sqlc.narg(family_slug)::text IS NULL OR f.slug = sqlc.narg(family_slug)::text)
ORDER BY f.slug;


-- name: ListPublicPlanPrices :many
-- ACTIVE prices of the given versions, in display order. Decimals as text.
SELECT p.license_id,
       p.id,
       p.billing_model,
       p.billing_timing,
       p.billing_period,
       p.unit_amount_decimal::text AS unit_amount_decimal,
       p.currency::text            AS currency,
       coalesce(p.sale_unit_factor::text, '')::text AS sale_unit_factor,
       e.slug                      AS entitlement_slug,
       e.sale_unit_singular,
       e.sale_unit_plural,
       p.display_label,
       p.display_order,
       p.is_default
FROM license_price p
LEFT JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id
WHERE p.organization_id = sqlc.arg(organization_id)
  AND p.license_id = ANY (sqlc.arg(license_ids)::uuid[])
  AND p.status = 'ACTIVE'
ORDER BY p.license_id, p.display_order, p.id;


-- name: ListPublicPlanEntitlements :many
-- The user-facing grants of the given versions. A grant whose entitlement is
-- not user_facing is internal to the vendor and never leaves through here.
SELECT le.license_id,
       e.slug,
       e.name,
       e.description,
       e.type,
       le.value,
       le.limit_cap_exceeded_overage_percent,
       e.icon,
       e.unit_singular,
       e.unit_plural,
       e.sale_unit_singular,
       e.sale_unit_plural,
       coalesce(e.sale_unit_factor::text, '')::text AS sale_unit_factor,
       e.display_order
FROM license_entitlement le
JOIN entitlement e ON e.id = le.entitlement_id AND e.organization_id = le.organization_id
WHERE le.organization_id = sqlc.arg(organization_id)
  AND le.license_id = ANY (sqlc.arg(license_ids)::uuid[])
  AND e.user_facing
ORDER BY le.license_id, e.display_order, e.slug;


-- name: ListPublicAddons :many
-- One row per public add-on family: its default version.
SELECT a.id,
       f.slug AS family_slug,
       a.slug,
       a.name,
       a.description,
       a.pricing_type,
       a.max_quantity
FROM addon a
JOIN addon_family f ON f.id = a.family_id AND f.organization_id = a.organization_id
WHERE a.organization_id = sqlc.arg(organization_id)
  AND f.is_public
  AND a.is_default
  AND a.lifecycle_state = 'PUBLISHED'
ORDER BY f.slug;


-- name: ListPublicAddonPrices :many
SELECT p.addon_id,
       p.id,
       p.billing_model,
       p.billing_timing,
       p.billing_period,
       p.unit_amount_decimal::text AS unit_amount_decimal,
       p.currency::text            AS currency,
       coalesce(p.sale_unit_factor::text, '')::text AS sale_unit_factor,
       e.slug                      AS entitlement_slug,
       e.sale_unit_singular,
       e.sale_unit_plural,
       p.display_label,
       p.display_order,
       p.is_default
FROM addon_price p
LEFT JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id
WHERE p.organization_id = sqlc.arg(organization_id)
  AND p.addon_id = ANY (sqlc.arg(addon_ids)::uuid[])
  AND p.status = 'ACTIVE'
ORDER BY p.addon_id, p.display_order, p.id;


-- name: ListPublicAddonEntitlements :many
SELECT ae.addon_id,
       e.slug,
       e.name,
       e.type,
       ae.value,
       ae.override_behavior,
       ae.limit_cap_exceeded_overage_percent
FROM addon_entitlement ae
JOIN entitlement e ON e.id = ae.entitlement_id AND e.organization_id = ae.organization_id
WHERE ae.organization_id = sqlc.arg(organization_id)
  AND ae.addon_id = ANY (sqlc.arg(addon_ids)::uuid[])
  AND e.user_facing
ORDER BY ae.addon_id, e.display_order, e.slug;


-- name: ListPublicAddonCompatibility :many
-- Which public licence families each listed add-on version fits. A private
-- licence family is left out: its slug is not the key's to learn.
SELECT c.addon_id,
       f.slug AS license_family_slug
FROM addon_compatible_license c
JOIN license_family f ON f.id = c.license_family_id AND f.organization_id = c.organization_id
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.addon_id = ANY (sqlc.arg(addon_ids)::uuid[])
  AND f.is_public
ORDER BY c.addon_id, f.slug;
