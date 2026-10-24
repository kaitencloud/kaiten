-- name: GetInstanceForRedeem :one
SELECT i.id, i.slug, i.customer_id, i.license_id
FROM instance i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.slug = sqlc.arg(slug);


-- name: GetRedeemSubscription :one
-- The instance's live subscription, held FOR SHARE so the currency and period
-- checks hold until the redemption commits, with its base price.
SELECT ib.billing_period, ib.currency::text AS currency, lp.currency::text AS base_currency,
       lp.unit_amount_decimal::text AS base_amount
FROM instance_billing ib
JOIN license_price lp ON lp.id = ib.base_license_price_id AND lp.organization_id = ib.organization_id
WHERE ib.organization_id = sqlc.arg(organization_id)
  AND ib.instance_id = sqlc.arg(instance_id)
  AND ib.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
FOR SHARE OF ib;


-- name: InstanceHoldsAnyAddon :one
SELECT EXISTS (SELECT 1
               FROM instance_addon ia
               WHERE ia.instance_id = sqlc.arg(instance_id)
                 AND ia.removed_at IS NULL
                 AND ia.addon_id = ANY (sqlc.arg(addon_ids)::uuid[]))::boolean AS holds;


-- name: CustomerHasPaid :one
-- Whether the customer has paid an invoice with something to pay, for any of
-- its instances: a customer who paid is no longer a first-time one.
SELECT EXISTS (SELECT 1
               FROM instance_invoice ii
               WHERE ii.organization_id = sqlc.arg(organization_id)
                 AND ii.customer_id = sqlc.arg(customer_id)
                 AND ii.status = 'PAID'
                 AND ii.total_minor > 0)::boolean AS paid;


-- name: InstanceHasBoostable :one
-- Whether the instance has, of any type, an entitlement among those a boost
-- targets: a view row (§11.4 check 8, V32-03 b).
SELECT EXISTS (SELECT 1
               FROM instance_effective_entitlement ee
               WHERE ee.instance_id = sqlc.arg(instance_id)
                 AND ee.entitlement_id = ANY (sqlc.arg(entitlement_ids)::uuid[]))::boolean AS boostable;


-- name: GetPlanPrice :one
-- The flat-fee price a subscription would start on, for the checks that read
-- the subscription's version, period, currency and amount (§11.3).
SELECT lp.license_id, lp.billing_period::text AS billing_period, lp.currency::text AS currency,
       lp.unit_amount_decimal::text AS unit_amount_decimal, (lp.status = 'ACTIVE')::boolean AS active
FROM license_price lp
WHERE lp.organization_id = sqlc.arg(organization_id)
  AND lp.id = sqlc.arg(id)
  AND lp.billing_model = 'FLAT_FEE';


-- name: InstanceRedeemed :one
SELECT EXISTS (SELECT 1
               FROM instance_voucher iv
               WHERE iv.instance_id = sqlc.arg(instance_id)
                 AND iv.voucher_id = sqlc.arg(voucher_id))::boolean AS redeemed;


-- name: ClaimRedemption :one
-- The conditional increment: the only race-free way to honour
-- max_redemptions. No row: the voucher stopped being redeemable.
UPDATE voucher
SET redemptions_count = redemptions_count + 1,
    status            = CASE
                          WHEN max_redemptions IS NOT NULL AND redemptions_count + 1 >= max_redemptions
                            THEN 'EXHAUSTED'::voucher_status
                          ELSE status END,
    updated_at        = sqlc.arg(now),
    updated_by_id     = sqlc.arg(user_id)
WHERE id = sqlc.arg(id)
  AND organization_id = sqlc.arg(organization_id)
  AND status = 'ACTIVE'
  AND (starts_at IS NULL OR starts_at <= sqlc.arg(now))
  AND (expires_at IS NULL OR expires_at > sqlc.arg(now))
  AND (max_redemptions IS NULL OR redemptions_count < max_redemptions)
RETURNING redemptions_count, status;


-- name: InsertInstanceVoucher :one
INSERT INTO instance_voucher (organization_id, instance_id, voucher_id, redeemed_at, redeemed_by_id,
                              effective_starts_at, effective_expires_at)
VALUES (sqlc.arg(organization_id), sqlc.arg(instance_id), sqlc.arg(voucher_id), sqlc.arg(now), sqlc.arg(user_id),
        sqlc.arg(now), sqlc.narg(effective_expires_at))
RETURNING id;


-- name: ListRedemptions :many
SELECT iv.id, iv.voucher_id, v.name AS voucher_name, v.voucher_type, v.code_normalized, i.slug AS instance_slug,
       iv.redeemed_at, iv.effective_starts_at, iv.effective_expires_at, iv.applications_count, iv.status,
       iv.expired_at, iv.revoked_at, iv.revoked_reason, v.duration, v.duration_in_periods,
       (v.price_discount_type IS NOT NULL)::boolean AS has_price_part
FROM instance_voucher iv
JOIN voucher v ON v.id = iv.voucher_id AND v.organization_id = iv.organization_id
JOIN instance i ON i.id = iv.instance_id AND i.organization_id = iv.organization_id
WHERE iv.organization_id = sqlc.arg(organization_id)
  AND (sqlc.narg(instance_id)::uuid IS NULL OR iv.instance_id = sqlc.narg(instance_id))
  AND (sqlc.narg(voucher_id)::uuid IS NULL OR iv.voucher_id = sqlc.narg(voucher_id))
  AND (sqlc.narg(id)::uuid IS NULL OR iv.id = sqlc.narg(id))
  AND (sqlc.narg(status)::instance_voucher_status IS NULL OR iv.status = sqlc.narg(status))
  AND (sqlc.narg(cursor_at)::timestamp IS NULL
    OR (iv.redeemed_at, iv.id) < (sqlc.narg(cursor_at)::timestamp, sqlc.narg(cursor_id)::uuid))
ORDER BY iv.redeemed_at DESC, iv.id DESC
-- NULL reads every match: an instance's redemptions, and the single reads.
LIMIT sqlc.narg(row_limit)::integer;


-- name: LockInstanceVoucher :one
SELECT iv.id, iv.status
FROM instance_voucher iv
WHERE iv.organization_id = sqlc.arg(organization_id)
  AND iv.instance_id = sqlc.arg(instance_id)
  AND iv.id = sqlc.arg(id)
FOR UPDATE;


-- name: RevokeInstanceVoucher :exec
UPDATE instance_voucher
SET status         = 'REVOKED',
    revoked_at     = sqlc.arg(now),
    revoked_by_id  = sqlc.arg(user_id)::uuid,
    revoked_reason = sqlc.arg(reason),
    updated_at     = sqlc.arg(now)
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id);


-- name: ListApplicableDiscounts :many
-- What billing reads at a boundary: the instance's redemptions with a PRICE
-- part that may apply to an invoice composed at an instant, oldest first
-- (§8.4 rules 1, 3): a PRICE voucher, or a COMPOSITE with the PRICE members.
-- A COMPOSITE's window is its grants'; it does not bound the PRICE part,
-- which its applications bound (rule 4, checked by the composer).
SELECT iv.id AS instance_voucher_id, iv.voucher_id, v.name, v.price_discount_type,
       coalesce(v.price_discount_value::text, '')::text AS price_discount_value, coalesce(v.currency::text, '')::text AS currency, v.price_applies_to,
       v.applicable_license_price_ids::uuid[] AS applicable_license_price_ids,
       v.applicable_addon_price_ids::uuid[] AS applicable_addon_price_ids, v.duration, v.duration_in_periods,
       iv.applications_count
FROM instance_voucher iv
JOIN voucher v ON v.id = iv.voucher_id AND v.organization_id = iv.organization_id
WHERE iv.organization_id = sqlc.arg(organization_id)
  AND iv.instance_id = sqlc.arg(instance_id)
  AND iv.status = 'ACTIVE'
  AND (v.voucher_type = 'PRICE' OR (v.voucher_type = 'COMPOSITE' AND v.price_discount_type IS NOT NULL))
  AND iv.redeemed_at <= sqlc.arg(at)
  AND iv.effective_starts_at <= sqlc.arg(at)
  AND (v.voucher_type = 'COMPOSITE' OR iv.effective_expires_at IS NULL OR sqlc.arg(at) < iv.effective_expires_at)
ORDER BY iv.redeemed_at, iv.id;


-- name: ApplyDiscount :one
-- One invoice received a DISCOUNT line from the redemption. Reaching the
-- duration's limit expires it, unless the grants of a COMPOSITE still run:
-- it then stays ACTIVE until step (b) finds its window over (§8.4
-- Consumption).
UPDATE instance_voucher iv
SET applications_count = iv.applications_count + 1,
    status             = CASE
                           WHEN sqlc.narg(applications_max)::integer IS NOT NULL
                             AND iv.applications_count + 1 >= sqlc.narg(applications_max)::integer
                             AND (v.voucher_type <> 'COMPOSITE' OR iv.effective_expires_at <= sqlc.arg(now)::timestamp)
                             THEN 'EXPIRED'::instance_voucher_status
                           ELSE iv.status END,
    expired_at         = CASE
                           WHEN sqlc.narg(applications_max)::integer IS NOT NULL
                             AND iv.applications_count + 1 >= sqlc.narg(applications_max)::integer
                             AND (v.voucher_type <> 'COMPOSITE' OR iv.effective_expires_at <= sqlc.arg(now)::timestamp)
                             THEN sqlc.arg(now)::timestamp
                           ELSE iv.expired_at END,
    updated_at         = sqlc.arg(now)::timestamp
FROM voucher v
WHERE iv.organization_id = sqlc.arg(organization_id)
  AND iv.id = sqlc.arg(id)
  AND v.id = iv.voucher_id
  AND v.organization_id = iv.organization_id
RETURNING iv.status;


-- name: ListExpiringVouchers :many
-- ACTIVE vouchers past their expires_at, oldest first: what billing-lifecycle
-- marks EXPIRED (§11.5). Across organizations; each is expired in its own
-- transaction.
SELECT v.id, v.organization_id
FROM voucher v
WHERE v.status = 'ACTIVE'
  AND v.expires_at <= sqlc.arg(now)::timestamp
ORDER BY v.expires_at, v.id
LIMIT sqlc.arg(page_size);


-- name: ExpireVoucher :one
-- Marks a voucher EXPIRED if it still is ACTIVE and past its expires_at. No
-- row when another pass, or an edit of expiresAt, got there first.
UPDATE voucher
SET status        = 'EXPIRED',
    updated_at    = sqlc.arg(now)::timestamp,
    updated_by_id = sqlc.arg(user_id)::uuid
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id)
  AND status = 'ACTIVE'
  AND expires_at <= sqlc.arg(now)::timestamp
RETURNING id, name, expires_at;


-- name: ListExpiringRedemptions :many
-- ACTIVE redemptions past their effective_expires_at -- boosts and flag
-- grants whose window ended -- oldest first (§11.5). A COMPOSITE with a PRICE
-- part also waits for its last application.
SELECT iv.id, iv.organization_id
FROM instance_voucher iv
JOIN voucher v ON v.id = iv.voucher_id AND v.organization_id = iv.organization_id
WHERE iv.status = 'ACTIVE'
  AND iv.effective_expires_at <= sqlc.arg(now)::timestamp
  AND NOT (v.voucher_type = 'COMPOSITE' AND v.price_discount_type IS NOT NULL
           AND (v.duration = 'FOREVER'
             OR iv.applications_count < CASE WHEN v.duration = 'ONE_TIME' THEN 1 ELSE v.duration_in_periods END))
ORDER BY iv.effective_expires_at, iv.id
LIMIT sqlc.arg(page_size);


-- name: ExpireRedemption :execrows
-- Re-checks what ListExpiringRedemptions found, under the row's update.
UPDATE instance_voucher iv
SET status     = 'EXPIRED',
    expired_at = sqlc.arg(now)::timestamp,
    updated_at = sqlc.arg(now)::timestamp
FROM voucher v
WHERE iv.organization_id = sqlc.arg(organization_id)
  AND iv.id = sqlc.arg(id)
  AND iv.status = 'ACTIVE'
  AND iv.effective_expires_at <= sqlc.arg(now)::timestamp
  AND v.id = iv.voucher_id
  AND v.organization_id = iv.organization_id
  AND NOT (v.voucher_type = 'COMPOSITE' AND v.price_discount_type IS NOT NULL
           AND (v.duration = 'FOREVER'
             OR iv.applications_count < CASE WHEN v.duration = 'ONE_TIME' THEN 1 ELSE v.duration_in_periods END));


-- name: GetVoucherSystemActor :one
-- system:kaiten's membership in an organization, which work Kaiten does on its
-- own behalf is recorded under.
SELECT u.id
FROM "user" u
JOIN user_on_organization m
  ON m.user_id = u.id
 AND m.organization_id = sqlc.arg(organization_id)
 AND m.deleted_at IS NULL
WHERE u.external_id = sqlc.arg(external_id);


-- name: ClaimPaidRedemption :one
-- An INCOMPLETE checkout's payment records the redemption its ACTIVATION
-- already discounted (§9.10 rule 3): never refused (§24 #65), so the count
-- stops at max_redemptions rather than breaking voucher_redemptions_check,
-- and whatever the voucher's status or window became meanwhile.
-- just_exhausted is the transition to EXHAUSTED this write made, if any.
WITH before AS (
  SELECT v.id, v.status
  FROM voucher v
  WHERE v.id = sqlc.arg(id)
    AND v.organization_id = sqlc.arg(organization_id)
  FOR UPDATE
)
UPDATE voucher v
SET redemptions_count = CASE
                          WHEN v.max_redemptions IS NULL OR v.redemptions_count < v.max_redemptions THEN v.redemptions_count + 1
                          ELSE v.redemptions_count END,
    status            = CASE
                          WHEN v.status = 'ACTIVE' AND v.max_redemptions IS NOT NULL AND v.redemptions_count + 1 >= v.max_redemptions
                            THEN 'EXHAUSTED'::voucher_status
                          ELSE v.status END,
    updated_at        = sqlc.arg(now),
    updated_by_id     = sqlc.arg(user_id)
FROM before
WHERE v.id = before.id
RETURNING v.redemptions_count, v.status, (v.status = 'EXHAUSTED' AND before.status <> 'EXHAUSTED')::boolean AS just_exhausted;


-- name: InsertPaidInstanceVoucher :one
-- The redemption, under the id the ACTIVATION's DISCOUNT line names. An
-- instance that redeemed the voucher meanwhile keeps that redemption.
INSERT INTO instance_voucher (id, organization_id, instance_id, voucher_id, redeemed_at, redeemed_by_id,
                              effective_starts_at, effective_expires_at)
VALUES (sqlc.arg(id), sqlc.arg(organization_id), sqlc.arg(instance_id), sqlc.arg(voucher_id), sqlc.arg(now), sqlc.arg(user_id),
        sqlc.arg(now), sqlc.narg(effective_expires_at))
ON CONFLICT DO NOTHING
RETURNING id;


-- name: GetRedeemSubscriptionState :one
-- The state of an instance's subscription, held FOR SHARE until the
-- redemption commits (§11.6): whether it is live, and whether a checkout
-- still waits on its payment over it.
SELECT ib.status::text AS status, (ib.pending_license_id IS NOT NULL)::boolean AS checkout_pending
FROM instance_billing ib
WHERE ib.organization_id = sqlc.arg(organization_id)
  AND ib.instance_id = sqlc.arg(instance_id)
FOR SHARE OF ib;


-- name: DiscountLimitReached :one
-- Whether redeeming the voucher would put a 21st discount on one line of the
-- instance's invoices, one Stripe invoice item (§11.4 check 10, V31-53): for
-- a price that can produce a line -- the live subscription's base and
-- scheduled prices, the licence's metered prices, the attached add-ons'
-- prices -- the voucher's PRICE part covers it, and so do 20 ACTIVE
-- redemptions already (§8.4 rule 6: LICENSE_BASE the BASE lines, ADDONS the
-- add-on lines, BOTH both, SELECTED_PRICES the prices it names). False for a
-- voucher without a PRICE part.
WITH lines AS (SELECT 'BASE'::text AS kind, p.id AS license_price_id, NULL::uuid AS addon_price_id
               FROM instance_billing ib
               JOIN license_price p
                 ON p.organization_id = ib.organization_id
                AND (p.id = ib.base_license_price_id OR p.id = ib.scheduled_license_price_id)
               WHERE ib.organization_id = sqlc.arg(organization_id)
                 AND ib.instance_id = sqlc.arg(instance_id)
                 AND ib.status <> 'CANCELED'
               UNION ALL
               SELECT 'LICENSE_METERED', p.id, NULL
               FROM instance i
               JOIN license_price p ON p.license_id = i.license_id AND p.organization_id = i.organization_id
               WHERE i.organization_id = sqlc.arg(organization_id)
                 AND i.id = sqlc.arg(instance_id)
                 AND p.billing_model IN ('USAGE_BASED', 'OVERAGE')
                 AND p.status = 'ACTIVE'
               UNION ALL
               SELECT 'ADDON', NULL, ap.id
               FROM instance_addon ia
               JOIN addon_price ap ON ap.addon_id = ia.addon_id AND ap.organization_id = ia.organization_id
               WHERE ia.organization_id = sqlc.arg(organization_id)
                 AND ia.instance_id = sqlc.arg(instance_id)
                 AND ia.removed_at IS NULL
                 AND ap.status = 'ACTIVE')
SELECT EXISTS (SELECT 1
               FROM lines l
               JOIN voucher n
                 ON n.organization_id = sqlc.arg(organization_id)
                AND n.id = sqlc.arg(voucher_id)
                AND n.price_discount_type IS NOT NULL
               WHERE ((n.price_applies_to IN ('LICENSE_BASE', 'BOTH') AND l.kind = 'BASE')
                   OR (n.price_applies_to IN ('ADDONS', 'BOTH') AND l.kind = 'ADDON')
                   OR (n.price_applies_to = 'SELECTED_PRICES'
                       AND (l.license_price_id = ANY (n.applicable_license_price_ids)
                         OR l.addon_price_id = ANY (n.applicable_addon_price_ids))))
                 AND (SELECT count(*)
                      FROM instance_voucher iv
                      JOIN voucher v ON v.id = iv.voucher_id AND v.organization_id = iv.organization_id
                      WHERE iv.organization_id = sqlc.arg(organization_id)
                        AND iv.instance_id = sqlc.arg(instance_id)
                        AND iv.status = 'ACTIVE'
                        AND v.price_discount_type IS NOT NULL
                        AND ((v.price_applies_to IN ('LICENSE_BASE', 'BOTH') AND l.kind = 'BASE')
                          OR (v.price_applies_to IN ('ADDONS', 'BOTH') AND l.kind = 'ADDON')
                          OR (v.price_applies_to = 'SELECTED_PRICES'
                              AND (l.license_price_id = ANY (v.applicable_license_price_ids)
                                OR l.addon_price_id = ANY (v.applicable_addon_price_ids))))) >= 20)::boolean AS reached;
