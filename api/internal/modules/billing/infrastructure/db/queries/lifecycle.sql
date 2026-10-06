-- name: CancelSubscription :one
-- Every column a transition to CANCELED writes, in one UPDATE: the row's
-- checks hold only together.
UPDATE instance_billing
SET status                     = 'CANCELED',
    canceled_at                = sqlc.arg(canceled_at),
    cancellation_reason        = coalesce(sqlc.narg(reason), cancellation_reason),
    cancel_at_period_end       = FALSE,
    past_due_since             = NULL,
    scheduled_license_price_id = NULL,
    scheduled_at               = NULL,
    updated_by_id              = sqlc.arg(user_id),
    updated_at                 = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: ScheduleCancellation :one
-- Cancel at period end: the status stays, the base paid in advance runs out,
-- and a pending plan change is dropped.
UPDATE instance_billing
SET cancel_at_period_end       = TRUE,
    cancel_requested_at        = sqlc.arg(now),
    cancellation_reason        = sqlc.narg(reason),
    scheduled_license_price_id = NULL,
    scheduled_at               = NULL,
    updated_by_id              = sqlc.arg(user_id),
    updated_at                 = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: RevertCancellation :one
UPDATE instance_billing
SET cancel_at_period_end = FALSE,
    cancel_requested_at  = NULL,
    cancellation_reason  = NULL,
    updated_by_id        = sqlc.arg(user_id),
    updated_at           = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: SetScheduledChange :one
UPDATE instance_billing
SET scheduled_license_price_id = sqlc.narg(price_id),
    scheduled_at               = sqlc.narg(scheduled_at),
    updated_by_id              = sqlc.arg(user_id),
    updated_at                 = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: UpdateSubscriptionTerms :one
UPDATE instance_billing
SET collection_method = sqlc.narg(collection_method),
    days_until_due    = sqlc.narg(days_until_due),
    updated_by_id     = sqlc.arg(user_id),
    updated_at        = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: ConvertTrial :one
-- A trial that ended: ACTIVE, anchored at its end.
UPDATE instance_billing
SET status               = 'ACTIVE',
    anchor_at            = sqlc.arg(anchor_at),
    current_period_start = sqlc.arg(anchor_at),
    current_period_end   = sqlc.arg(period_end),
    updated_by_id        = sqlc.arg(user_id),
    updated_at           = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: ApplyPlanChange :one
-- The scheduled price becomes the base at the boundary, which anchors the new
-- periods.
UPDATE instance_billing
SET base_license_price_id      = scheduled_license_price_id,
    billing_period             = sqlc.arg(billing_period),
    currency                   = sqlc.arg(currency),
    anchor_at                  = sqlc.arg(anchor_at),
    current_period_start       = sqlc.arg(anchor_at),
    current_period_end         = sqlc.arg(period_end),
    scheduled_license_price_id = NULL,
    scheduled_at               = NULL,
    updated_by_id              = sqlc.arg(user_id),
    updated_at                 = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: AllowPlanChange :exec
-- The one escape from the instance freeze, for this transaction only.
SELECT set_config('kaiten.billing_apply_plan_change', 'on', TRUE);


-- name: MoveInstanceToLicense :exec
UPDATE instance
SET license_id = sqlc.arg(license_id),
    updated_at = sqlc.arg(now)
WHERE id = sqlc.arg(id);


-- name: SetPastDue :one
UPDATE instance_billing
SET status         = sqlc.arg(status),
    past_due_since = sqlc.narg(past_due_since),
    updated_by_id  = sqlc.arg(user_id),
    updated_at     = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: EarliestOverdue :one
-- When the subscription's earliest overdue invoice became overdue: issued,
-- unpaid, something owed, past its due date. NULL when none is.
SELECT min(i.due_at)::timestamp AS overdue_since
FROM instance_invoice i
WHERE i.instance_billing_id = sqlc.arg(instance_billing_id)
  AND i.status IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED')
  AND i.total_minor > 0
  AND i.due_at < sqlc.arg(now);


-- name: ListOverdueCandidates :many
-- The subscriptions whose overdue status may have to move: ACTIVE ones with
-- an overdue invoice, PAST_DUE ones without.
SELECT ib.id, ib.organization_id
FROM instance_billing ib
WHERE (ib.status = 'ACTIVE' AND EXISTS (
         SELECT 1 FROM instance_invoice i
          WHERE i.instance_billing_id = ib.id
            AND i.status IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED')
            AND i.total_minor > 0
            AND i.due_at < sqlc.arg(now)))
   OR (ib.status = 'PAST_DUE' AND NOT EXISTS (
         SELECT 1 FROM instance_invoice i
          WHERE i.instance_billing_id = ib.id
            AND i.status IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED')
            AND i.total_minor > 0
            AND i.due_at < sqlc.arg(now)))
ORDER BY ib.id
LIMIT sqlc.arg(page_size);
