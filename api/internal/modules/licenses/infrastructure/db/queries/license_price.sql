-- name: GetLicenseForPricing :one
-- The version a price request names, with its family's slug for the events.
-- FOR NO KEY UPDATE: a price write is decided on the version's lifecycle state,
-- and the single-currency trigger takes the same lock.
SELECT l.id, l.lifecycle_state, l.name, lf.slug AS family_slug
FROM license l
JOIN license_family lf ON lf.id = l.family_id AND lf.organization_id = l.organization_id
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.slug = sqlc.arg(slug)
FOR NO KEY UPDATE OF l;


-- name: GetLicenseIDBySlug :one
SELECT l.id, l.name
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.slug = sqlc.arg(slug);


-- name: GetPricingEntitlement :one
-- The entitlement a metered price would meter, with the version's grant of it
-- (NULL columns when the version does not grant it). The decimals come out as
-- text.
SELECT e.id,
       e.slug,
       e.name,
       e.type,
       e.aggregation_method,
       e.reset_period,
       coalesce(e.sale_unit_factor::text, '')::text AS sale_unit_factor,
       e.sale_unit_singular,
       e.sale_unit_plural,
       le.value                 AS grant_value,
       le.limit_cap_exceeded_overage_percent AS grant_overage_percent
FROM entitlement e
LEFT JOIN license_entitlement le
  ON le.entitlement_id = e.id
 AND le.license_id = sqlc.arg(license_id)
 AND le.organization_id = e.organization_id
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.slug = sqlc.arg(slug);


-- name: CountOtherActiveMeteredPrices :one
-- How many ACTIVE metered prices of the version, other than except_price_id,
-- meter the entitlement: one meter, one price.
SELECT count(*)::int AS count
FROM license_price p
WHERE p.license_id = sqlc.arg(license_id)
  AND p.meters_entitlement_id = sqlc.arg(entitlement_id)
  AND p.status = 'ACTIVE'
  AND p.id <> sqlc.arg(except_price_id);


-- name: InsertLicensePrice :one
INSERT INTO license_price (organization_id, license_id, billing_model, billing_timing, billing_period,
                           unit_amount_decimal, currency, meters_entitlement_id, sale_unit_factor,
                           display_label, display_order, is_default, created_by_id, updated_by_id)
VALUES (sqlc.arg(organization_id), sqlc.arg(license_id), sqlc.arg(billing_model), sqlc.arg(billing_timing),
        sqlc.narg(billing_period), CAST(sqlc.arg(unit_amount_decimal)::text AS NUMERIC), sqlc.arg(currency),
        sqlc.narg(meters_entitlement_id), CAST(sqlc.narg(sale_unit_factor)::text AS NUMERIC),
        sqlc.narg(display_label), sqlc.arg(display_order), sqlc.arg(is_default),
        sqlc.arg(user_id), sqlc.arg(user_id))
RETURNING id;


-- name: UpdateLicensePrice :one
-- Writes a DRAFT version's price as a whole: the use case merges the request
-- over the stored price and validates the result first.
UPDATE license_price
SET billing_timing        = sqlc.arg(billing_timing),
    billing_period        = sqlc.narg(billing_period),
    unit_amount_decimal   = CAST(sqlc.arg(unit_amount_decimal)::text AS NUMERIC),
    meters_entitlement_id = sqlc.narg(meters_entitlement_id),
    sale_unit_factor      = CAST(sqlc.narg(sale_unit_factor)::text AS NUMERIC),
    display_label         = sqlc.narg(display_label),
    display_order         = sqlc.arg(display_order),
    is_default            = sqlc.arg(is_default),
    updated_by_id         = sqlc.arg(user_id),
    updated_at            = now()
WHERE organization_id = sqlc.arg(organization_id)
  AND license_id = sqlc.arg(license_id)
  AND id = sqlc.arg(id)
RETURNING id;


-- name: DeprecateLicensePrice :one
-- Deprecation is the one change a published price takes. A deprecated price
-- cannot be a default, so the flag is cleared in the same write.
UPDATE license_price
SET status        = 'DEPRECATED',
    deprecated_at = now(),
    is_default    = FALSE,
    updated_by_id = sqlc.arg(user_id),
    updated_at    = now()
WHERE organization_id = sqlc.arg(organization_id)
  AND license_id = sqlc.arg(license_id)
  AND id = sqlc.arg(id)
  AND status = 'ACTIVE'
RETURNING id;


-- name: ListLicensePrices :many
-- A version's prices in display order, each with what it meters. Decimals come
-- out as text.
SELECT p.id,
       p.billing_model,
       p.billing_timing,
       p.billing_period,
       p.unit_amount_decimal::text AS unit_amount_decimal,
       p.currency::text            AS currency,
       p.meters_entitlement_id,
       coalesce(p.sale_unit_factor::text, '')::text AS sale_unit_factor,
       e.slug                      AS entitlement_slug,
       e.sale_unit_singular,
       e.sale_unit_plural,
       p.display_label,
       p.display_order,
       p.is_default,
       p.status,
       p.deprecated_at,
       p.created_at,
       p.updated_at
FROM license_price p
LEFT JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id
WHERE p.organization_id = sqlc.arg(organization_id)
  AND p.license_id = sqlc.arg(license_id)
  AND (sqlc.narg(status)::price_status IS NULL OR p.status = sqlc.narg(status)::price_status)
  AND (sqlc.narg(billing_model)::billing_model IS NULL OR p.billing_model = sqlc.narg(billing_model)::billing_model)
ORDER BY p.display_order, p.id;


-- name: GetLicensePrice :one
SELECT p.id,
       p.billing_model,
       p.billing_timing,
       p.billing_period,
       p.unit_amount_decimal::text AS unit_amount_decimal,
       p.currency::text            AS currency,
       p.meters_entitlement_id,
       coalesce(p.sale_unit_factor::text, '')::text AS sale_unit_factor,
       e.slug                      AS entitlement_slug,
       e.sale_unit_singular,
       e.sale_unit_plural,
       p.display_label,
       p.display_order,
       p.is_default,
       p.status,
       p.deprecated_at,
       p.created_at,
       p.updated_at
FROM license_price p
LEFT JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id
WHERE p.organization_id = sqlc.arg(organization_id)
  AND p.license_id = sqlc.arg(license_id)
  AND p.id = sqlc.arg(id);


-- name: ListMeteredGrants :many
-- The entitlements the version's ACTIVE metered prices meter, with the
-- version's grant of each (NULL columns when it no longer grants one).
SELECT e.id,
       e.slug,
       e.name,
       le.value                              AS grant_value,
       le.limit_cap_exceeded_overage_percent AS grant_overage_percent
FROM license_price p
JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id
LEFT JOIN license_entitlement le
  ON le.entitlement_id = e.id
 AND le.license_id = p.license_id
 AND le.organization_id = p.organization_id
WHERE p.organization_id = sqlc.arg(organization_id)
  AND p.license_id = sqlc.arg(license_id)
  AND p.status = 'ACTIVE';


-- name: BillingClock :one
-- The instant a composition is made at: the database's, in UTC, to the
-- millisecond, like every stored instant.
SELECT date_trunc('milliseconds', now() AT TIME ZONE 'UTC')::timestamp AS now;
