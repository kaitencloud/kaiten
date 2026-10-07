-- name: ClaimPushBatch :many
-- Leases the next invoices to push: due, not held, oldest first, skipping the
-- ones another replica holds. The lease (next_push_at moved to lease_until)
-- keeps another pass off an invoice while this one pushes it.
UPDATE instance_invoice i
SET next_push_at = sqlc.arg(lease_until),
    updated_at   = sqlc.arg(now)
WHERE i.id IN (SELECT q.id
               FROM instance_invoice q
               WHERE q.provider_kind <> 'NOOP'
                 AND q.provider_kind::text = ANY (sqlc.arg(kinds)::text[])
                 -- An issued invoice the provider charges stays in the queue
                 -- until the charge's outcome is known.
                 AND (q.status IN ('DRAFT', 'PUSH_FAILED')
                   OR (q.status = 'PUSHED' AND q.collection_method = 'CHARGE_AUTOMATICALLY'))
                 AND q.hold_reason IS NULL
                 AND q.next_push_at <= sqlc.arg(now)
               ORDER BY q.next_push_at
               LIMIT sqlc.arg(batch) FOR UPDATE SKIP LOCKED)
RETURNING i.id;


-- name: GetInvoiceByID :one
SELECT *
FROM instance_invoice
WHERE id = sqlc.arg(id);


-- name: SetInvoiceCustomer :execrows
-- Push step 0's result. Every push write is conditional on the invoice still
-- being pushable: a void during the run leaves it untouched (0 rows).
UPDATE instance_invoice
SET external_customer_id = sqlc.arg(external_customer_id),
    updated_at           = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status IN ('DRAFT', 'PUSH_FAILED');


-- name: SetInvoiceDraft :execrows
-- Push step 1's result: the provider's draft.
UPDATE instance_invoice
SET external_invoice_id = sqlc.arg(external_invoice_id),
    provider_status     = 'draft',
    updated_at          = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status IN ('DRAFT', 'PUSH_FAILED');


-- name: SetInvoiceLines :execrows
-- Push step 2's results, and reconciliation's: the lines with their provider
-- ids and amounts.
UPDATE instance_invoice
SET lines      = sqlc.arg(lines),
    updated_at = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND (sqlc.arg(any_status)::boolean OR status IN ('DRAFT', 'PUSH_FAILED'));


-- name: AwaitFinalization :execrows
-- Review mode: the draft is complete in the provider and waits for a human
-- to finalize it there, or for retry-push. It is not issued.
UPDATE instance_invoice
SET status          = 'DRAFT',
    next_push_at    = NULL,
    last_push_error = NULL,
    updated_at      = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status IN ('DRAFT', 'PUSH_FAILED');


-- name: MarkPushed :one
-- Finalization, by Kaiten or seen by sync: the invoice is issued by its
-- provider.
UPDATE instance_invoice
SET status                  = 'PUSHED',
    provider_status         = sqlc.arg(provider_status),
    provider_invoice_number = sqlc.narg(provider_invoice_number),
    hosted_invoice_url      = sqlc.narg(hosted_invoice_url),
    invoice_pdf_url         = sqlc.narg(invoice_pdf_url),
    issued_at               = sqlc.arg(issued_at),
    days_until_due          = sqlc.arg(days_until_due),
    due_at                  = sqlc.arg(issued_at)::timestamp + make_interval(days => sqlc.arg(days_until_due)::integer),
    handoff_status          = sqlc.arg(handoff_status),
    pushed_at               = sqlc.arg(now),
    synced_at               = sqlc.arg(now),
    -- Charged automatically: still in the push queue, for the charge, under
    -- the run's lease; a run that dies before the charge leaves it due.
    next_push_at            = CASE WHEN collection_method = 'CHARGE_AUTOMATICALLY'
                                   THEN sqlc.arg(now)::timestamp + interval '10 minutes' END,
    last_push_error         = NULL,
    updated_at              = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status IN ('DRAFT', 'PUSH_FAILED')
RETURNING *;


-- name: MarkPushFailed :one
-- A failed push step: retried after a backoff.
UPDATE instance_invoice
SET status          = 'PUSH_FAILED',
    push_attempts   = push_attempts + 1,
    last_push_error = sqlc.arg(last_push_error),
    next_push_at    = sqlc.arg(next_push_at),
    updated_at      = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status IN ('DRAFT', 'PUSH_FAILED')
RETURNING *;


-- name: RequeuePush :one
-- retry-push: the invoice is pushed by the next pass.
UPDATE instance_invoice
SET next_push_at = sqlc.arg(now),
    updated_at   = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND provider_kind <> 'NOOP'
  AND status IN ('DRAFT', 'PUSH_FAILED')
RETURNING *;


-- name: SetReconciliation :execrows
-- An invoice is reconciled once, right after its finalization.
UPDATE instance_invoice
SET reconciliation_status              = sqlc.arg(reconciliation_status),
    reconciliation_detail              = sqlc.narg(reconciliation_detail),
    reconciled_at                      = sqlc.arg(now),
    provider_total_excluding_tax_minor = sqlc.arg(provider_total_excluding_tax_minor),
    lines                              = sqlc.arg(lines),
    synced_at                          = sqlc.arg(now),
    updated_at                         = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND reconciliation_status IS NULL;


-- name: ApplyProviderPaid :one
-- Paid in the provider, by any path. Transitions only advance.
UPDATE instance_invoice
SET status          = 'PAID',
    paid_at         = sqlc.arg(paid_at),
    provider_status = 'paid',
    next_push_at    = NULL,
    synced_at       = sqlc.arg(now),
    updated_at      = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status IN ('PUSHED', 'PAYMENT_FAILED', 'UNCOLLECTIBLE')
RETURNING *;


-- name: ApplyProviderUncollectible :one
UPDATE instance_invoice
SET status           = 'UNCOLLECTIBLE',
    uncollectible_at = sqlc.arg(uncollectible_at),
    provider_status  = 'uncollectible',
    synced_at        = sqlc.arg(now),
    updated_at       = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status IN ('PUSHED', 'PAYMENT_FAILED')
RETURNING *;


-- name: ApplyProviderVoid :one
-- Voided, or its draft deleted, in the provider.
UPDATE instance_invoice
SET status          = 'VOID',
    voided_at       = sqlc.arg(voided_at),
    voided_by_id    = NULL,
    void_reason     = sqlc.arg(void_reason),
    provider_status = sqlc.narg(provider_status),
    next_push_at    = NULL,
    synced_at       = sqlc.arg(now),
    updated_at      = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status IN ('DRAFT', 'PUSH_FAILED', 'PUSHED', 'PAYMENT_FAILED', 'UNCOLLECTIBLE')
RETURNING *;


-- name: TouchProviderInvoice :exec
-- A read that changed nothing Kaiten mirrors.
UPDATE instance_invoice
SET synced_at  = sqlc.arg(now),
    updated_at = sqlc.arg(now)
WHERE id = sqlc.arg(id);


-- name: GetInvoiceByExternalID :one
SELECT *
FROM instance_invoice
WHERE organization_id = sqlc.arg(organization_id)
  AND provider_kind = sqlc.arg(provider_kind)
  AND external_invoice_id = sqlc.arg(external_invoice_id);


-- name: ListOpenProviderInvoices :many
-- What the daily sweep reads by id: issued and not settled, awaiting
-- finalization in review mode, or finalized but not reconciled yet.
SELECT *
FROM instance_invoice
WHERE organization_id = sqlc.arg(organization_id)
  AND provider_kind = sqlc.arg(provider_kind)
  AND external_invoice_id IS NOT NULL
  AND (status IN ('PUSHED', 'PAYMENT_FAILED')
    OR (status = 'DRAFT' AND next_push_at IS NULL)
    OR (reconciliation_status IS NULL AND status NOT IN ('DRAFT', 'PUSH_FAILED', 'VOID')))
ORDER BY synced_at NULLS FIRST, id
LIMIT sqlc.arg(batch);


-- name: ListSyncTargets :many
-- The (organization, provider) pairs sync visits: those with a provider
-- invoice still open, or a sync state already.
SELECT DISTINCT i.organization_id, i.provider_kind
FROM instance_invoice i
WHERE i.provider_kind <> 'NOOP'
  AND i.external_invoice_id IS NOT NULL
  AND (i.status IN ('PUSHED', 'PAYMENT_FAILED', 'DRAFT') OR i.reconciliation_status IS NULL)
UNION
SELECT s.organization_id, s.provider_kind
FROM billing_sync_state s;


-- name: GetSyncState :one
SELECT *
FROM billing_sync_state
WHERE organization_id = sqlc.arg(organization_id)
  AND provider_kind = sqlc.arg(provider_kind);


-- name: SaveSyncState :exec
INSERT INTO billing_sync_state (organization_id, provider_kind, cursor, cursor_created_at, last_synced_at,
                                last_sync_status, last_sync_error, consecutive_failures, last_full_sweep_at)
VALUES (sqlc.arg(organization_id), sqlc.arg(provider_kind), sqlc.narg(cursor), sqlc.narg(cursor_created_at),
        sqlc.arg(last_synced_at), sqlc.arg(last_sync_status), sqlc.narg(last_sync_error),
        sqlc.arg(consecutive_failures), sqlc.narg(last_full_sweep_at))
ON CONFLICT (organization_id, provider_kind) DO UPDATE
  SET cursor               = EXCLUDED.cursor,
      cursor_created_at    = EXCLUDED.cursor_created_at,
      last_synced_at       = EXCLUDED.last_synced_at,
      last_sync_status     = EXCLUDED.last_sync_status,
      last_sync_error      = EXCLUDED.last_sync_error,
      consecutive_failures = EXCLUDED.consecutive_failures,
      last_full_sweep_at   = EXCLUDED.last_full_sweep_at,
      updated_at           = CURRENT_TIMESTAMP;


-- name: GetCustomerBilling :one
SELECT *
FROM customer_billing
WHERE organization_id = sqlc.arg(organization_id)
  AND customer_id = sqlc.arg(customer_id)
  AND provider_kind = sqlc.arg(provider_kind);


-- name: UpsertCustomerBilling :exec
INSERT INTO customer_billing (customer_id, organization_id, provider_kind, external_customer_id, web_url, synced_at)
VALUES (sqlc.arg(customer_id), sqlc.arg(organization_id), sqlc.arg(provider_kind), sqlc.arg(external_customer_id),
        sqlc.narg(web_url), sqlc.arg(now))
ON CONFLICT (customer_id, provider_kind) DO UPDATE
  SET external_customer_id = EXCLUDED.external_customer_id,
      web_url              = EXCLUDED.web_url,
      synced_at            = EXCLUDED.synced_at,
      last_error           = NULL,
      updated_at           = CURRENT_TIMESTAMP;


-- name: SetSubscriptionProvider :one
UPDATE instance_billing
SET provider_kind = sqlc.arg(provider_kind),
    updated_by_id = sqlc.arg(user_id),
    updated_at    = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: OpenInvoicesOfSubscription :many
-- The subscription's invoices still open, as the switch's answer lists them.
SELECT id, status, provider_kind
FROM instance_invoice
WHERE instance_billing_id = sqlc.arg(instance_billing_id)
  AND status IN ('DRAFT', 'PUSH_FAILED', 'MANUAL', 'PUSHED', 'PAYMENT_FAILED')
ORDER BY created_at;


-- name: BillingHealth :one
-- The health section, computed at read time.
SELECT
  (SELECT count(*) FROM instance_billing b
    WHERE b.organization_id = sqlc.arg(organization_id) AND b.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
      AND b.current_period_end <= sqlc.arg(now))::bigint AS close_backlog,
  (SELECT min(b.current_period_end) FROM instance_billing b
    WHERE b.organization_id = sqlc.arg(organization_id) AND b.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
      AND b.current_period_end <= sqlc.arg(now))::timestamp AS oldest_due_at,
  (SELECT count(*) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id) AND i.hold_reason IS NOT NULL)::bigint AS held,
  (SELECT count(*) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id) AND i.hold_reason = 'LEDGER_SEQUENCE_GAP')::bigint AS held_sequence_gap,
  (SELECT count(*) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id) AND i.hold_reason = 'LEDGER_CHAIN_BREAK')::bigint AS held_chain_break,
  (SELECT count(*) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id) AND i.hold_reason = 'LEDGER_COUNTER_MISMATCH')::bigint AS held_counter_mismatch,
  (SELECT count(*) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id) AND i.status = 'PUSH_FAILED'
      AND i.push_attempts >= sqlc.arg(alert_after_attempts)::integer)::bigint AS push_failures,
  (SELECT min(i.updated_at) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id) AND i.status = 'PUSH_FAILED'
      AND i.push_attempts >= sqlc.arg(alert_after_attempts)::integer)::timestamp AS oldest_push_failure_at,
  (SELECT count(*) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id) AND i.reconciliation_status = 'MISMATCH'
      AND i.reconciled_at > sqlc.arg(now)::timestamp - interval '30 days')::bigint AS reconciliation_mismatches,
  (SELECT count(*) FROM instance_billing b
    WHERE b.organization_id = sqlc.arg(organization_id) AND b.status = 'PAST_DUE')::bigint AS past_due,
  (SELECT count(*) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id) AND i.status IN ('MANUAL', 'PUSHED', 'PAYMENT_FAILED')
      AND (CASE WHEN i.collection_method = 'CHARGE_AUTOMATICALLY'
              THEN (i.status = 'PAYMENT_FAILED' AND i.last_payment_error IS DISTINCT FROM 'authentication_required')
                OR i.issued_at < sqlc.arg(auto_collection_before)::timestamp
              ELSE i.due_at < sqlc.arg(now)::timestamp END))::bigint AS overdue,
  (SELECT count(*) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id) AND i.handoff_status = 'PENDING')::bigint AS handoff_pending,
  (SELECT min(i.issued_at) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id) AND i.handoff_status = 'PENDING')::timestamp AS oldest_pending_issued_at;


-- name: ListSyncStates :many
SELECT *
FROM billing_sync_state
WHERE organization_id = sqlc.arg(organization_id)
ORDER BY provider_kind;


-- name: CountProviderRouting :one
-- What still routes to a provider in an organization: the subscriptions not
-- canceled that invoice through it, and its invoices not settled yet. A
-- provider's connector cannot be disconnected under either.
SELECT
  (SELECT count(*) FROM instance_billing ib
    WHERE ib.organization_id = sqlc.arg(organization_id)
      AND ib.provider_kind = sqlc.arg(provider_kind)
      AND ib.status <> 'CANCELED')::bigint AS active_subscriptions,
  (SELECT count(*) FROM instance_invoice i
    WHERE i.organization_id = sqlc.arg(organization_id)
      AND i.provider_kind = sqlc.arg(provider_kind)
      AND i.status IN ('DRAFT', 'PUSHED', 'PUSH_FAILED', 'PAYMENT_FAILED'))::bigint AS open_invoices;


-- name: GetAnyCustomerBillingID :one
-- One customer the organization already maps in a provider: a new key must
-- reach the account it lives in.
SELECT cb.external_customer_id
FROM customer_billing cb
WHERE cb.organization_id = sqlc.arg(organization_id)
  AND cb.provider_kind = sqlc.arg(provider_kind)
ORDER BY cb.created_at
LIMIT 1;



-- name: MarkChargeUnknown :one
-- A charge whose outcome is unknown (the provider did not answer): the
-- invoice stays PUSHED and the charge is retried, under the same key, after a
-- backoff. It counts as a push attempt, so the backoff and the alert apply.
UPDATE instance_invoice
SET push_attempts   = push_attempts + 1,
    last_push_error = sqlc.arg(last_push_error),
    next_push_at    = sqlc.arg(next_push_at),
    updated_at      = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status = 'PUSHED'
  AND collection_method = 'CHARGE_AUTOMATICALLY'
RETURNING *;


-- name: ApplyPaymentFailed :one
-- An automatic charge refused (declined, expired, nothing to charge) or
-- awaiting the customer's authentication: the provider keeps the invoice open,
-- the customer pays on its hosted page or the provider retries.
UPDATE instance_invoice
SET status             = 'PAYMENT_FAILED',
    payment_failed_at  = sqlc.arg(failed_at),
    last_payment_error = sqlc.arg(last_payment_error),
    provider_status    = 'open',
    next_push_at       = NULL,
    synced_at          = sqlc.arg(now),
    updated_at         = sqlc.arg(now)
WHERE id = sqlc.arg(id)
  AND status = 'PUSHED'
RETURNING *;


-- name: SetPaymentMethod :one
-- The labels of the customer's default payment method in a provider, as the
-- provider reports them. Never card data.
UPDATE customer_billing
SET default_payment_method_id  = sqlc.arg(payment_method_id),
    payment_method_brand       = sqlc.narg(brand),
    payment_method_last4       = sqlc.narg(last4),
    payment_method_exp_month   = sqlc.narg(exp_month),
    payment_method_exp_year    = sqlc.narg(exp_year),
    payment_method_status      = 'ACTIVE',
    payment_method_attached_at = CASE WHEN default_payment_method_id IS DISTINCT FROM sqlc.arg(payment_method_id)
                                        OR payment_method_attached_at IS NULL
                                      THEN sqlc.arg(now)::timestamp ELSE payment_method_attached_at END,
    synced_at                  = sqlc.arg(now),
    updated_at                 = sqlc.arg(now)
WHERE organization_id = sqlc.arg(organization_id)
  AND customer_id = sqlc.arg(customer_id)
  AND provider_kind = sqlc.arg(provider_kind)
RETURNING *;


-- name: ClearPaymentMethod :one
UPDATE customer_billing
SET default_payment_method_id  = NULL,
    payment_method_brand       = NULL,
    payment_method_last4       = NULL,
    payment_method_exp_month   = NULL,
    payment_method_exp_year    = NULL,
    payment_method_status      = 'NONE',
    payment_method_attached_at = NULL,
    synced_at                  = sqlc.arg(now),
    updated_at                 = sqlc.arg(now)
WHERE organization_id = sqlc.arg(organization_id)
  AND customer_id = sqlc.arg(customer_id)
  AND provider_kind = sqlc.arg(provider_kind)
RETURNING *;


-- name: MarkPaymentMethodStatus :exec
-- A charge told the payment method is no longer usable (EXPIRED, FAILED).
UPDATE customer_billing
SET payment_method_status = sqlc.arg(status),
    updated_at            = sqlc.arg(now)
WHERE organization_id = sqlc.arg(organization_id)
  AND customer_id = sqlc.arg(customer_id)
  AND provider_kind = sqlc.arg(provider_kind)
  AND payment_method_status <> 'NONE';


-- name: GetCustomerBillingByExternalID :one
SELECT *
FROM customer_billing
WHERE organization_id = sqlc.arg(organization_id)
  AND provider_kind = sqlc.arg(provider_kind)
  AND external_customer_id = sqlc.arg(external_customer_id);
