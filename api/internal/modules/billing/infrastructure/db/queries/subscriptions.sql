-- name: BillingClock :one
-- The instant billing acts at: the database's clock, in UTC, to the
-- millisecond -- the clock the usage report dates its reports with.
SELECT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now;


-- name: LockInstanceForSubscribe :one
-- The instance a subscribe names, locked for the transaction: its customer
-- and licence are what the subscription is for.
SELECT i.id, i.slug, i.name, i.customer_id, i.license_id
FROM instance i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.slug = sqlc.arg(slug)
FOR UPDATE;


-- name: GetInstanceBySlug :one
SELECT i.id, i.slug, i.name, i.customer_id, i.license_id
FROM instance i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.slug = sqlc.arg(slug);


-- name: GetBillingCustomer :one
-- The customer a subscription bills. billing_email is personal data: it is
-- snapshotted on the invoice, never written to an event.
SELECT c.id, c.slug, c.name, c.billing_email
FROM customer c
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.id = sqlc.arg(id);


-- name: GetBillingLicense :one
SELECT l.id, l.slug, l.name, l.lifecycle_state
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.id = sqlc.arg(id);


-- name: GetInstanceBilling :one
-- An instance's subscription row, the one it keeps for life.
SELECT *
FROM instance_billing ib
WHERE ib.organization_id = sqlc.arg(organization_id)
  AND ib.instance_id = sqlc.arg(instance_id);


-- name: LockInstanceBilling :one
SELECT *
FROM instance_billing ib
WHERE ib.organization_id = sqlc.arg(organization_id)
  AND ib.instance_id = sqlc.arg(instance_id)
FOR UPDATE;


-- name: InsertInstanceBilling :one
INSERT INTO instance_billing (organization_id, instance_id, customer_id, instance_slug, instance_name,
                              customer_slug, customer_name, status, provider_kind, collection_method,
                              days_until_due, base_license_price_id, billing_period, currency, anchor_at,
                              started_at, current_period_start, current_period_end, created_by_id,
                              updated_by_id)
VALUES (sqlc.arg(organization_id), sqlc.arg(instance_id), sqlc.arg(customer_id), sqlc.arg(instance_slug),
        sqlc.arg(instance_name), sqlc.arg(customer_slug), sqlc.arg(customer_name), sqlc.arg(status),
        sqlc.arg(provider_kind), sqlc.narg(collection_method), sqlc.narg(days_until_due),
        sqlc.arg(base_license_price_id), sqlc.arg(billing_period), sqlc.arg(currency), sqlc.arg(anchor_at),
        sqlc.arg(anchor_at), sqlc.arg(anchor_at), sqlc.arg(current_period_end), sqlc.arg(user_id),
        sqlc.arg(user_id))
RETURNING *;


-- name: ResubscribeInstanceBilling :one
-- A CANCELED subscription subscribed again: the same row, with a new price,
-- anchor and period, and nothing left of the life that ended.
UPDATE instance_billing
SET customer_id           = sqlc.arg(customer_id),
    instance_slug         = sqlc.arg(instance_slug),
    instance_name         = sqlc.arg(instance_name),
    customer_slug         = sqlc.arg(customer_slug),
    customer_name         = sqlc.arg(customer_name),
    status                = sqlc.arg(status),
    provider_kind         = sqlc.arg(provider_kind),
    collection_method     = sqlc.narg(collection_method),
    days_until_due        = sqlc.narg(days_until_due),
    base_license_price_id = sqlc.arg(base_license_price_id),
    billing_period        = sqlc.arg(billing_period),
    currency              = sqlc.arg(currency),
    anchor_at             = sqlc.arg(anchor_at),
    started_at            = sqlc.arg(anchor_at),
    current_period_start  = sqlc.arg(anchor_at),
    current_period_end    = sqlc.arg(current_period_end),
    cancel_at_period_end  = FALSE,
    cancel_requested_at   = NULL,
    canceled_at           = NULL,
    cancellation_reason   = NULL,
    past_due_since        = NULL,
    scheduled_license_price_id = NULL,
    scheduled_at          = NULL,
    updated_by_id         = sqlc.arg(user_id),
    updated_at            = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND organization_id = sqlc.arg(organization_id)
  AND status = 'CANCELED'
RETURNING *;
