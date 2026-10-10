-- name: LockInstanceForAddons :one
-- The instance an attachment write names, with its licence family, locked so
-- the writes of one instance serialize (and with a licence change).
SELECT i.id, i.license_id, l.family_id AS license_family_id
FROM instance i
JOIN license l ON l.id = i.license_id AND l.organization_id = i.organization_id
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.slug = sqlc.arg(slug)
FOR NO KEY UPDATE OF i;


-- name: GetInstanceIDBySlug :one
SELECT i.id
FROM instance i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.slug = sqlc.arg(slug);


-- name: GetLiveSubscription :one
-- The instance's live subscription, if any, with the family of the version a
-- scheduled plan change moves it to, and whether its period has ended without
-- being closed yet. Locked FOR SHARE, so a close in progress finishes first.
SELECT ib.id, ib.status, ib.billing_period, ib.currency::text AS currency, ib.current_period_end,
       sl.family_id AS scheduled_family_id,
       (ib.current_period_end <= date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC'))::boolean AS boundary_pending
FROM instance_billing ib
LEFT JOIN license_price sp
  ON sp.id = ib.scheduled_license_price_id AND sp.organization_id = ib.organization_id
LEFT JOIN license sl ON sl.id = sp.license_id AND sl.organization_id = sp.organization_id
WHERE ib.organization_id = sqlc.arg(organization_id)
  AND ib.instance_id = sqlc.arg(instance_id)
  AND ib.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
FOR SHARE OF ib;


-- name: AddonIsCompatible :one
SELECT EXISTS (SELECT 1
               FROM addon_compatible_license c
               WHERE c.addon_id = sqlc.arg(addon_id)
                 AND c.license_family_id = sqlc.arg(license_family_id))::boolean AS compatible;


-- name: AddonCurrencies :many
SELECT DISTINCT p.currency::text AS currency
FROM addon_price p
WHERE p.addon_id = sqlc.arg(addon_id);


-- name: AddonHasDefaultPriceFor :one
-- Whether a billed subscription of that period can bill the add-on's flat
-- fee (§10.2): it has a default ACTIVE FLAT_FEE price for the period, or no
-- FLAT_FEE price at all (a metered-only add-on bills its usage).
SELECT (EXISTS (SELECT 1
                FROM addon_price p
                WHERE p.addon_id = sqlc.arg(addon_id)
                  AND p.billing_period = sqlc.arg(billing_period)::billing_period
                  AND p.is_default
                  AND p.status = 'ACTIVE')
        OR NOT EXISTS (SELECT 1
                       FROM addon_price p
                       WHERE p.addon_id = sqlc.arg(addon_id)
                         AND p.billing_model = 'FLAT_FEE'
                         AND p.status = 'ACTIVE'))::boolean AS priced;


-- name: MeteredEntitlementConflicts :many
-- The entitlements an ACTIVE price of this add-on meters that a price of the
-- instance's licence version, or of another add-on it holds, meters already:
-- one entitlement is billed by one price.
SELECT DISTINCT e.slug
FROM addon_price ap
JOIN entitlement e ON e.id = ap.meters_entitlement_id AND e.organization_id = ap.organization_id
WHERE ap.addon_id = sqlc.arg(addon_id)
  AND ap.status = 'ACTIVE'
  AND (EXISTS (SELECT 1
               FROM license_price lp
               WHERE lp.license_id = sqlc.arg(license_id)
                 AND lp.meters_entitlement_id = ap.meters_entitlement_id
                 AND lp.status = 'ACTIVE')
  OR EXISTS (SELECT 1
             FROM instance_addon ia
             JOIN addon_price op ON op.addon_id = ia.addon_id AND op.organization_id = ia.organization_id
             WHERE ia.instance_id = sqlc.arg(instance_id)
               AND ia.removed_at IS NULL
               AND ia.addon_id <> ap.addon_id
               AND op.meters_entitlement_id = ap.meters_entitlement_id
               AND op.status = 'ACTIVE'))
ORDER BY e.slug;


-- name: InsertInstanceAddon :one
INSERT INTO instance_addon (organization_id, instance_id, addon_id, addon_family_id, quantity, created_by_id,
                            updated_by_id)
VALUES (sqlc.arg(organization_id), sqlc.arg(instance_id), sqlc.arg(addon_id), sqlc.arg(addon_family_id),
        sqlc.arg(quantity), sqlc.arg(user_id), sqlc.arg(user_id))
RETURNING id;


-- name: ListInstanceAddons :many
SELECT ia.id, ia.addon_id, ia.quantity, ia.created_at, ia.removed_at, ia.updated_at,
       a.slug AS addon_slug, a.name AS addon_name, a.max_quantity, f.slug AS family_slug
FROM instance_addon ia
JOIN addon a ON a.id = ia.addon_id AND a.organization_id = ia.organization_id
JOIN addon_family f ON f.id = ia.addon_family_id AND f.organization_id = ia.organization_id
WHERE ia.organization_id = sqlc.arg(organization_id)
  AND ia.instance_id = sqlc.arg(instance_id)
  AND (sqlc.arg(include_removed)::boolean OR ia.removed_at IS NULL)
  AND (sqlc.narg(id)::uuid IS NULL OR ia.id = sqlc.narg(id))
ORDER BY ia.created_at, ia.id;


-- name: LockActiveInstanceAddon :one
SELECT ia.id, ia.addon_id, ia.quantity, a.max_quantity
FROM instance_addon ia
JOIN addon a ON a.id = ia.addon_id AND a.organization_id = ia.organization_id
WHERE ia.organization_id = sqlc.arg(organization_id)
  AND ia.instance_id = sqlc.arg(instance_id)
  AND a.slug = sqlc.arg(addon_slug)
  AND ia.removed_at IS NULL
FOR UPDATE OF ia;


-- name: SetInstanceAddonQuantity :exec
UPDATE instance_addon
SET quantity      = sqlc.arg(quantity),
    updated_at    = CURRENT_TIMESTAMP,
    updated_by_id = sqlc.arg(user_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id);


-- name: RemoveInstanceAddon :exec
UPDATE instance_addon
SET removed_at    = CURRENT_TIMESTAMP,
    removed_by_id = sqlc.arg(user_id)::uuid,
    updated_at    = CURRENT_TIMESTAMP,
    updated_by_id = sqlc.arg(user_id)::uuid
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id);


-- name: ListBillableAddons :many
-- What billing reads at a boundary: the add-ons an instance holds, each with
-- its default FLAT_FEE price for the subscription's period. A held add-on
-- without one bills nothing.
SELECT ia.id AS instance_addon_id, ia.addon_id, ia.quantity, a.slug AS addon_slug, a.name AS addon_name,
       p.id AS price_id, p.billing_timing, p.unit_amount_decimal::text AS unit_amount_decimal,
       p.currency::text AS currency, p.display_label
FROM instance_addon ia
JOIN addon a ON a.id = ia.addon_id AND a.organization_id = ia.organization_id
JOIN addon_price p
  ON p.addon_id = ia.addon_id
 AND p.organization_id = ia.organization_id
 AND p.billing_period = sqlc.arg(billing_period)::billing_period
 AND p.is_default
 AND p.status = 'ACTIVE'
WHERE ia.organization_id = sqlc.arg(organization_id)
  AND ia.instance_id = sqlc.arg(instance_id)
  AND ia.removed_at IS NULL
ORDER BY ia.created_at, ia.id;


-- name: AddonsIncompatibleWith :many
-- The add-ons an instance holds that a move to the licence version would
-- strand: not compatible with its family, or (for a PAID add-on) without a
-- default ACTIVE price for the period.
SELECT a.slug
FROM instance_addon ia
JOIN addon a ON a.id = ia.addon_id AND a.organization_id = ia.organization_id
WHERE ia.organization_id = sqlc.arg(organization_id)
  AND ia.instance_id = sqlc.arg(instance_id)
  AND ia.removed_at IS NULL
  AND (NOT EXISTS (SELECT 1
                   FROM addon_compatible_license c
                   JOIN license l ON l.family_id = c.license_family_id AND l.organization_id = c.organization_id
                   WHERE c.addon_id = ia.addon_id
                     AND l.id = sqlc.arg(license_id))
  OR (a.pricing_type = 'PAID' AND NOT EXISTS (SELECT 1
                                             FROM addon_price p
                                             WHERE p.addon_id = ia.addon_id
                                               AND p.billing_period = sqlc.arg(billing_period)::billing_period
                                               AND p.is_default
                                               AND p.status = 'ACTIVE')
                               AND EXISTS (SELECT 1
                                           FROM addon_price p
                                           WHERE p.addon_id = ia.addon_id
                                             AND p.billing_model = 'FLAT_FEE'
                                             AND p.status = 'ACTIVE')))
ORDER BY a.slug;


-- name: ListActiveInstanceAddonsByInstances :many
-- The add-ons instances hold now, oldest attachment first, for GraphQL's
-- Instance.addons.
SELECT ia.id, ia.instance_id, ia.addon_id, ia.quantity, ia.created_at,
       a.slug AS addon_slug, a.name AS addon_name, a.max_quantity, f.slug AS family_slug
FROM instance_addon ia
JOIN addon a ON a.id = ia.addon_id AND a.organization_id = ia.organization_id
JOIN addon_family f ON f.id = ia.addon_family_id AND f.organization_id = ia.organization_id
WHERE ia.organization_id = sqlc.arg(organization_id)
  AND ia.instance_id = ANY (sqlc.arg(instance_ids)::uuid[])
  AND ia.removed_at IS NULL
ORDER BY ia.created_at, ia.id;


-- name: ListBillableAttachments :many
-- The attachments an arrears period bills (§10.4): every one active at any
-- time in [from, to) -- attached before to, not removed by from -- removed
-- ones included, in attachment order.
SELECT ia.id AS instance_addon_id, ia.addon_id, ia.addon_family_id, ia.quantity, ia.created_at AS attached_at,
       ia.removed_at, a.name AS addon_name
FROM instance_addon ia
JOIN addon a ON a.id = ia.addon_id AND a.organization_id = ia.organization_id
WHERE ia.organization_id = sqlc.arg(organization_id)
  AND ia.instance_id = sqlc.arg(instance_id)
  AND ia.created_at < sqlc.arg(to_at)
  AND (ia.removed_at IS NULL OR ia.removed_at > sqlc.arg(from_at))
ORDER BY ia.created_at, ia.id;
