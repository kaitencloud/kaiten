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


-- name: GetFallbackTarget :one
-- The fallback the family of the instance's licence names, re-checked at the
-- move (§9.11 rule 6): whether every version of it is still FREE, and its
-- default PUBLISHED version, NULL without one. No row: the family names none,
-- or the instance is gone. The share lock holds the fallback family there, as
-- a version write locks it before checking FallbackMustBeFree.
SELECT i.slug                                          AS instance_slug,
       NOT EXISTS (SELECT 1
                   FROM license v
                   WHERE v.organization_id = fallback.organization_id
                     AND v.family_id = fallback.id
                     AND v.pricing_type <> 'FREE')::boolean AS free,
       target.id                                       AS license_id
FROM instance i
JOIN license l
  ON l.id = i.license_id
 AND l.organization_id = i.organization_id
JOIN license_family f
  ON f.id = l.family_id
 AND f.organization_id = l.organization_id
JOIN license_family fallback
  ON fallback.id = f.fallback_license_family_id
 AND fallback.organization_id = f.organization_id
LEFT JOIN license target
  ON target.family_id = fallback.id
 AND target.organization_id = fallback.organization_id
 AND target.is_default
 AND target.lifecycle_state = 'PUBLISHED'
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.id = sqlc.arg(instance_id)
FOR SHARE OF fallback;


-- name: GetTrialEndBehavior :one
-- What a trial ending under CHARGE_AUTOMATICALLY with an amount due does
-- without a card (§9.2 rule 4, V31-65): the setting of the family of the base
-- price's version, and whether the customer's payment method on the
-- subscription's provider is ACTIVE.
SELECT f.trial_end_without_payment_method,
       EXISTS (SELECT 1
               FROM customer_billing cb
               WHERE cb.organization_id = ib.organization_id
                 AND cb.customer_id = ib.customer_id
                 AND cb.provider_kind = ib.provider_kind
                 AND cb.payment_method_status = 'ACTIVE')::boolean AS has_active_payment_method
FROM instance_billing ib
JOIN license_price p
  ON p.id = ib.base_license_price_id
 AND p.organization_id = ib.organization_id
JOIN license l
  ON l.id = p.license_id
 AND l.organization_id = p.organization_id
JOIN license_family f
  ON f.id = l.family_id
 AND f.organization_id = l.organization_id
WHERE ib.id = sqlc.arg(id);


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
-- unpaid, something owed, past its due date. NULL when none is. An invoice
-- the provider charges is overdue from its refused charge, or once the
-- auto-collection grace after its issue elapsed (§9.6 rule 1).
SELECT min(CASE WHEN i.collection_method = 'CHARGE_AUTOMATICALLY'
                THEN CASE WHEN i.status = 'PAYMENT_FAILED' AND i.last_payment_error IS DISTINCT FROM 'authentication_required'
                          THEN i.payment_failed_at
                          ELSE i.issued_at + (sqlc.arg(now)::timestamp - sqlc.arg(auto_collection_before)::timestamp) END
                ELSE i.due_at END)::timestamp AS overdue_since
FROM instance_invoice i
JOIN instance_billing ib ON ib.id = i.instance_billing_id
WHERE i.instance_billing_id = sqlc.arg(instance_billing_id)
  AND i.status IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED')
  AND i.total_minor > 0
  -- A checkout's ACTIVATION waiting for its payment is never overdue (§9.10
  -- rules 5 and 6): the free subscription it waits over goes on as it was.
  AND NOT (i.kind = 'ACTIVATION' AND ib.pending_license_id IS NOT NULL)
  AND (CASE WHEN i.collection_method = 'CHARGE_AUTOMATICALLY'
              THEN (i.status = 'PAYMENT_FAILED' AND i.last_payment_error IS DISTINCT FROM 'authentication_required')
                OR i.issued_at < sqlc.arg(auto_collection_before)::timestamp
              ELSE i.due_at < sqlc.arg(now)::timestamp END);


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
            AND NOT (i.kind = 'ACTIVATION' AND ib.pending_license_id IS NOT NULL)
            AND (CASE WHEN i.collection_method = 'CHARGE_AUTOMATICALLY'
              THEN (i.status = 'PAYMENT_FAILED' AND i.last_payment_error IS DISTINCT FROM 'authentication_required')
                OR i.issued_at < sqlc.arg(auto_collection_before)::timestamp
              ELSE i.due_at < sqlc.arg(now)::timestamp END)))
   OR (ib.status = 'PAST_DUE' AND NOT EXISTS (
         SELECT 1 FROM instance_invoice i
          WHERE i.instance_billing_id = ib.id
            AND i.status IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED')
            AND i.total_minor > 0
            AND NOT (i.kind = 'ACTIVATION' AND ib.pending_license_id IS NOT NULL)
            AND (CASE WHEN i.collection_method = 'CHARGE_AUTOMATICALLY'
              THEN (i.status = 'PAYMENT_FAILED' AND i.last_payment_error IS DISTINCT FROM 'authentication_required')
                OR i.issued_at < sqlc.arg(auto_collection_before)::timestamp
              ELSE i.due_at < sqlc.arg(now)::timestamp END)))
ORDER BY ib.id
LIMIT sqlc.arg(page_size);


-- name: SettleIncomplete :one
-- The payment of an INCOMPLETE subscription's ACTIVATION (§9.10 rule 3):
-- ACTIVE from this instant, its P0 floor, the pending selection cleared;
-- anchor_at and the period stay those the ACTIVATION billed.
UPDATE instance_billing
SET status                = 'ACTIVE',
    started_at            = sqlc.arg(now),
    pending_license_id    = NULL,
    pending_selection     = NULL,
    incomplete_expires_at = NULL,
    updated_by_id         = sqlc.arg(user_id),
    updated_at            = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status = 'INCOMPLETE'
RETURNING *;


-- name: GetInstanceSlug :one
SELECT i.slug, i.license_id
FROM instance i
WHERE i.id = sqlc.arg(id);


-- name: ListExpiredIncomplete :many
-- billing-lifecycle step (d): the checkouts past their 23 h, INCOMPLETE or
-- waiting over a free live subscription (§9.10 rules 4 and 6).
SELECT ib.*
FROM instance_billing ib
WHERE ib.incomplete_expires_at IS NOT NULL
  AND ib.incomplete_expires_at <= sqlc.arg(now)
ORDER BY ib.incomplete_expires_at, ib.id
LIMIT sqlc.arg(page_size);


-- name: GetOpenActivation :one
-- The ACTIVATION an INCOMPLETE subscription waits on: the newest one not
-- settled (a void and recompose may have replaced the first).
SELECT *
FROM instance_invoice i
WHERE i.instance_billing_id = sqlc.arg(instance_billing_id)
  AND i.kind = 'ACTIVATION'
  AND i.status IN ('DRAFT', 'PUSH_FAILED', 'PUSHED', 'PAYMENT_FAILED')
ORDER BY i.created_at DESC, i.id DESC
LIMIT 1;


-- name: EndIncomplete :one
-- An INCOMPLETE subscription ended unpaid, by its expiry or a cancel
-- (§9.10 rules 4-5): CANCELED at once, its selection dropped unapplied.
UPDATE instance_billing
SET status                = 'CANCELED',
    canceled_at           = sqlc.arg(now),
    cancellation_reason   = sqlc.narg(reason),
    pending_license_id    = NULL,
    pending_selection     = NULL,
    incomplete_expires_at = NULL,
    updated_by_id         = sqlc.arg(user_id),
    updated_at            = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status = 'INCOMPLETE'
RETURNING *;


-- name: ClearPendingCheckout :one
-- A checkout that waited over a free live subscription ended unpaid (§9.10
-- rule 6): the free subscription goes on as it was.
UPDATE instance_billing
SET pending_license_id    = NULL,
    pending_selection     = NULL,
    incomplete_expires_at = NULL,
    updated_by_id         = sqlc.arg(user_id),
    updated_at            = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status <> 'INCOMPLETE'
  AND pending_license_id IS NOT NULL
RETURNING *;


-- name: GetLatestInstanceActivation :one
-- The newest ACTIVATION of an instance's subscription, settled or not: what
-- an anonymous checkout session reads of its payment (§14.8).
SELECT i.*
FROM instance_invoice i
JOIN instance_billing ib
  ON ib.id = i.instance_billing_id
WHERE ib.organization_id = sqlc.arg(organization_id)
  AND ib.instance_id = sqlc.arg(instance_id)
  AND i.kind = 'ACTIVATION'
ORDER BY i.created_at DESC, i.id DESC
LIMIT 1;


-- name: ListDueTrialReminders :many
-- billing-lifecycle step (e): the trials whose reminder is due and not sent
-- (§9.2 rule 7), oldest first. Each is announced in its own transaction, under
-- MarkTrialReminderSent's condition, so a replica racing it announces nothing.
SELECT *
FROM instance_billing
WHERE status = 'TRIAL'
  AND trial_will_end_notified_at IS NULL
  AND trial_will_end_at <= sqlc.arg(now)
ORDER BY trial_will_end_at, id
LIMIT sqlc.arg(page_size);


-- name: MarkTrialReminderSent :one
-- The once-only marker of trial_will_end, set in the transaction that emits it.
UPDATE instance_billing
SET trial_will_end_notified_at = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status = 'TRIAL'
  AND trial_will_end_notified_at IS NULL
RETURNING *;
