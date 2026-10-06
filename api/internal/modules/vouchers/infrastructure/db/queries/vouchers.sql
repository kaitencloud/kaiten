-- name: InsertVoucher :one
INSERT INTO voucher (organization_id, code, name, description, voucher_type, duration, duration_in_periods,
                     max_redemptions, starts_at, expires_at, price_discount_type, price_discount_value, currency,
                     price_applies_to, applicable_license_price_ids, applicable_addon_price_ids,
                     applicable_license_ids, applicable_addon_ids, restricted_customer_id, redemption_rules,
                     created_by_id, updated_by_id)
VALUES (sqlc.arg(organization_id), sqlc.arg(code), sqlc.arg(name), sqlc.narg(description), sqlc.arg(voucher_type),
        sqlc.arg(duration), sqlc.narg(duration_in_periods), sqlc.narg(max_redemptions), sqlc.narg(starts_at),
        sqlc.narg(expires_at), sqlc.narg(price_discount_type),
        CAST(sqlc.narg(price_discount_value)::text AS NUMERIC), sqlc.narg(currency), sqlc.narg(price_applies_to),
        sqlc.arg(applicable_license_price_ids)::uuid[], sqlc.arg(applicable_addon_price_ids)::uuid[],
        sqlc.arg(applicable_license_ids)::uuid[], sqlc.arg(applicable_addon_ids)::uuid[],
        sqlc.narg(restricted_customer_id), sqlc.arg(redemption_rules), sqlc.arg(user_id), sqlc.arg(user_id))
RETURNING id;


-- name: UpdateVoucher :exec
UPDATE voucher
SET code                         = sqlc.arg(code),
    name                         = sqlc.arg(name),
    description                  = sqlc.narg(description),
    duration                     = sqlc.arg(duration),
    duration_in_periods          = sqlc.narg(duration_in_periods),
    max_redemptions              = sqlc.narg(max_redemptions),
    starts_at                    = sqlc.narg(starts_at),
    expires_at                   = sqlc.narg(expires_at),
    price_discount_type          = sqlc.narg(price_discount_type),
    price_discount_value         = CAST(sqlc.narg(price_discount_value)::text AS NUMERIC),
    currency                     = sqlc.narg(currency),
    price_applies_to             = sqlc.narg(price_applies_to),
    applicable_license_price_ids = sqlc.arg(applicable_license_price_ids)::uuid[],
    applicable_addon_price_ids   = sqlc.arg(applicable_addon_price_ids)::uuid[],
    applicable_license_ids       = sqlc.arg(applicable_license_ids)::uuid[],
    applicable_addon_ids         = sqlc.arg(applicable_addon_ids)::uuid[],
    restricted_customer_id       = sqlc.narg(restricted_customer_id),
    redemption_rules             = sqlc.arg(redemption_rules),
    updated_at                   = CURRENT_TIMESTAMP,
    updated_by_id                = sqlc.arg(user_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id);


-- name: SetVoucherStatus :exec
UPDATE voucher
SET status        = sqlc.arg(status),
    updated_at    = CURRENT_TIMESTAMP,
    updated_by_id = sqlc.arg(user_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id);


-- name: InsertVoucherGrant :exec
INSERT INTO voucher_entitlement_grant (organization_id, voucher_id, entitlement_id, modifier_type, modifier_value)
VALUES (sqlc.arg(organization_id), sqlc.arg(voucher_id), sqlc.arg(entitlement_id), sqlc.arg(modifier_type),
        CAST(sqlc.narg(modifier_value)::text AS NUMERIC));


-- name: DeleteVoucherGrants :exec
DELETE
FROM voucher_entitlement_grant
WHERE organization_id = sqlc.arg(organization_id)
  AND voucher_id = sqlc.arg(voucher_id);


-- name: ListVouchers :many
-- Vouchers with their decimals as text, newest first; id narrows to one,
-- code to the one a normalized code names.
SELECT v.id, v.code, v.code_normalized, v.name, v.description, v.voucher_type, v.status, v.duration,
       v.duration_in_periods, v.max_redemptions, v.redemptions_count, v.starts_at, v.expires_at,
       v.price_discount_type, coalesce(v.price_discount_value::text, '')::text AS price_discount_value, coalesce(v.currency::text, '')::text AS currency,
       v.price_applies_to, v.applicable_license_price_ids::uuid[] AS applicable_license_price_ids,
       v.applicable_addon_price_ids::uuid[] AS applicable_addon_price_ids,
       v.applicable_license_ids::uuid[] AS applicable_license_ids,
       v.applicable_addon_ids::uuid[] AS applicable_addon_ids, v.restricted_customer_id,
       c.slug AS restricted_customer_slug, v.redemption_rules, v.created_at, v.updated_at
FROM voucher v
LEFT JOIN customer c ON c.id = v.restricted_customer_id AND c.organization_id = v.organization_id
WHERE v.organization_id = sqlc.arg(organization_id)
  AND (sqlc.narg(id)::uuid IS NULL OR v.id = sqlc.narg(id))
  AND (sqlc.narg(code)::text IS NULL
    OR v.code_normalized = upper(regexp_replace(sqlc.narg(code)::text, '[^A-Za-z0-9]', '', 'g')))
  AND (sqlc.narg(status)::voucher_status IS NULL OR v.status = sqlc.narg(status))
  AND (sqlc.narg(voucher_type)::voucher_type IS NULL OR v.voucher_type = sqlc.narg(voucher_type))
  AND (sqlc.narg(customer_slug)::text IS NULL OR c.slug = sqlc.narg(customer_slug))
ORDER BY v.created_at DESC, v.id DESC;


-- name: LockVoucher :one
SELECT v.id, v.status, v.voucher_type, v.redemptions_count
FROM voucher v
WHERE v.organization_id = sqlc.arg(organization_id)
  AND v.id = sqlc.arg(id)
FOR UPDATE;


-- name: ListVoucherGrants :many
SELECT g.voucher_id, g.modifier_type, coalesce(g.modifier_value::text, '')::text AS modifier_value, e.slug AS entitlement_slug,
       g.entitlement_id
FROM voucher_entitlement_grant g
JOIN entitlement e ON e.id = g.entitlement_id AND e.organization_id = g.organization_id
WHERE g.organization_id = sqlc.arg(organization_id)
  AND g.voucher_id = ANY (sqlc.arg(voucher_ids)::uuid[])
ORDER BY e.slug;


-- name: GetCustomerIDBySlug :one
SELECT id
FROM customer
WHERE organization_id = sqlc.arg(organization_id)
  AND slug = sqlc.arg(slug);


-- name: GetBoostableEntitlement :one
SELECT id, type
FROM entitlement
WHERE organization_id = sqlc.arg(organization_id)
  AND slug = sqlc.arg(slug);


-- name: CountLicensePrices :one
SELECT count(*)::integer
FROM license_price
WHERE organization_id = sqlc.arg(organization_id)
  AND id = ANY (sqlc.arg(ids)::uuid[]);


-- name: CountAddonPrices :one
SELECT count(*)::integer
FROM addon_price
WHERE organization_id = sqlc.arg(organization_id)
  AND id = ANY (sqlc.arg(ids)::uuid[]);


-- name: CountLicenses :one
SELECT count(*)::integer
FROM license
WHERE organization_id = sqlc.arg(organization_id)
  AND id = ANY (sqlc.arg(ids)::uuid[]);


-- name: CountAddons :one
SELECT count(*)::integer
FROM addon
WHERE organization_id = sqlc.arg(organization_id)
  AND id = ANY (sqlc.arg(ids)::uuid[]);


-- name: VoucherClock :one
SELECT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now;
