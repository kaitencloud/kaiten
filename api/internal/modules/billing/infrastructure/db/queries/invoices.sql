-- name: InsertInvoice :one
INSERT INTO instance_invoice (organization_id, instance_billing_id, customer_id, instance_slug, instance_name,
                              customer_slug, customer_name, license_id, license_slug, billing_email, kind,
                              boundary_at, service_from, service_to, currency, subtotal_minor,
                              discount_total_minor, total_minor, lines, status, hold_reason, hold_detail, held_at,
                              provider_kind, collection_method, issued_at, days_until_due, due_at, paid_at,
                              replaces_invoice_id, handoff_status, next_push_at, created_at, updated_at)
VALUES (sqlc.arg(organization_id), sqlc.arg(instance_billing_id), sqlc.narg(customer_id), sqlc.arg(instance_slug),
        sqlc.arg(instance_name), sqlc.arg(customer_slug), sqlc.arg(customer_name), sqlc.arg(license_id),
        sqlc.arg(license_slug), sqlc.narg(billing_email), sqlc.arg(kind), sqlc.arg(boundary_at),
        sqlc.arg(service_from), sqlc.arg(service_to), sqlc.arg(currency), sqlc.arg(subtotal_minor),
        sqlc.arg(discount_total_minor), sqlc.arg(total_minor), sqlc.arg(lines), sqlc.arg(status),
        sqlc.narg(hold_reason), sqlc.narg(hold_detail), sqlc.narg(held_at), sqlc.arg(provider_kind),
        sqlc.arg(collection_method), sqlc.narg(issued_at), sqlc.narg(days_until_due), sqlc.narg(due_at),
        sqlc.narg(paid_at), sqlc.narg(replaces_invoice_id), sqlc.arg(handoff_status), sqlc.narg(next_push_at),
        sqlc.arg(now), sqlc.arg(now))
RETURNING *;


-- name: ListInvoices :many
-- One page of an organization's invoices, newest first, under the list's
-- filters. customer_slug and instance_slug match the slug the invoice was
-- composed under or the customer/instance that holds it now, so a rename
-- loses nothing. Fetched one row past the page.
SELECT *
FROM instance_invoice i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND (cardinality(sqlc.arg(statuses)::text[]) = 0 OR i.status::text = ANY (sqlc.arg(statuses)::text[]))
  AND (sqlc.narg(kind)::invoice_kind IS NULL OR i.kind = sqlc.narg(kind)::invoice_kind)
  AND (sqlc.narg(provider_kind)::billing_provider_kind IS NULL OR i.provider_kind = sqlc.narg(provider_kind)::billing_provider_kind)
  AND (sqlc.narg(customer_slug)::text IS NULL
       OR i.customer_slug = sqlc.narg(customer_slug)::text
       OR i.customer_id = (SELECT c.id FROM customer c
                            WHERE c.organization_id = i.organization_id AND c.slug = sqlc.narg(customer_slug)::text))
  AND (sqlc.narg(instance_slug)::text IS NULL
       OR i.instance_slug = sqlc.narg(instance_slug)::text
       OR i.instance_billing_id = (SELECT ib.id FROM instance_billing ib
                                     JOIN instance n ON n.id = ib.instance_id
                                    WHERE n.organization_id = i.organization_id AND n.slug = sqlc.narg(instance_slug)::text))
  AND (sqlc.narg(instance_billing_id)::uuid IS NULL OR i.instance_billing_id = sqlc.narg(instance_billing_id)::uuid)
  AND (NOT sqlc.arg(overdue)::boolean
       OR (i.status IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED') AND (CASE WHEN i.collection_method = 'CHARGE_AUTOMATICALLY'
              THEN (i.status = 'PAYMENT_FAILED' AND i.last_payment_error IS DISTINCT FROM 'authentication_required')
                OR i.issued_at < sqlc.arg(auto_collection_before)::timestamp
              ELSE i.due_at < sqlc.arg(now)::timestamp END)))
  AND (NOT sqlc.arg(held)::boolean OR i.hold_reason IS NOT NULL)
  AND (sqlc.narg(handoff_status)::handoff_status IS NULL OR i.handoff_status = sqlc.narg(handoff_status)::handoff_status)
  AND (sqlc.narg(issued_from)::timestamp IS NULL OR i.issued_at >= sqlc.narg(issued_from)::timestamp)
  AND (sqlc.narg(issued_to)::timestamp IS NULL OR i.issued_at < sqlc.narg(issued_to)::timestamp)
  AND (sqlc.narg(boundary_from)::timestamp IS NULL OR i.boundary_at >= sqlc.narg(boundary_from)::timestamp)
  AND (sqlc.narg(boundary_to)::timestamp IS NULL OR i.boundary_at < sqlc.narg(boundary_to)::timestamp)
  AND (NOT sqlc.arg(has_cursor)::boolean
       OR (i.created_at, i.id) < (sqlc.arg(cursor_at)::timestamp, sqlc.arg(cursor_id)::uuid))
ORDER BY i.created_at DESC, i.id DESC
LIMIT sqlc.arg(page_size);


-- name: ListInvoicesUpdatedSince :many
-- The same, for incremental sync: the invoices changed since an instant,
-- oldest change first, so a consumer that stores the last updatedAt it read
-- misses none.
SELECT *
FROM instance_invoice i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND (cardinality(sqlc.arg(statuses)::text[]) = 0 OR i.status::text = ANY (sqlc.arg(statuses)::text[]))
  AND (sqlc.narg(kind)::invoice_kind IS NULL OR i.kind = sqlc.narg(kind)::invoice_kind)
  AND (sqlc.narg(provider_kind)::billing_provider_kind IS NULL OR i.provider_kind = sqlc.narg(provider_kind)::billing_provider_kind)
  AND (sqlc.narg(customer_slug)::text IS NULL
       OR i.customer_slug = sqlc.narg(customer_slug)::text
       OR i.customer_id = (SELECT c.id FROM customer c
                            WHERE c.organization_id = i.organization_id AND c.slug = sqlc.narg(customer_slug)::text))
  AND (sqlc.narg(instance_slug)::text IS NULL
       OR i.instance_slug = sqlc.narg(instance_slug)::text
       OR i.instance_billing_id = (SELECT ib.id FROM instance_billing ib
                                     JOIN instance n ON n.id = ib.instance_id
                                    WHERE n.organization_id = i.organization_id AND n.slug = sqlc.narg(instance_slug)::text))
  AND (sqlc.narg(instance_billing_id)::uuid IS NULL OR i.instance_billing_id = sqlc.narg(instance_billing_id)::uuid)
  AND (NOT sqlc.arg(overdue)::boolean
       OR (i.status IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED') AND (CASE WHEN i.collection_method = 'CHARGE_AUTOMATICALLY'
              THEN (i.status = 'PAYMENT_FAILED' AND i.last_payment_error IS DISTINCT FROM 'authentication_required')
                OR i.issued_at < sqlc.arg(auto_collection_before)::timestamp
              ELSE i.due_at < sqlc.arg(now)::timestamp END)))
  AND (NOT sqlc.arg(held)::boolean OR i.hold_reason IS NOT NULL)
  AND (sqlc.narg(handoff_status)::handoff_status IS NULL OR i.handoff_status = sqlc.narg(handoff_status)::handoff_status)
  AND (sqlc.narg(issued_from)::timestamp IS NULL OR i.issued_at >= sqlc.narg(issued_from)::timestamp)
  AND (sqlc.narg(issued_to)::timestamp IS NULL OR i.issued_at < sqlc.narg(issued_to)::timestamp)
  AND (sqlc.narg(boundary_from)::timestamp IS NULL OR i.boundary_at >= sqlc.narg(boundary_from)::timestamp)
  AND (sqlc.narg(boundary_to)::timestamp IS NULL OR i.boundary_at < sqlc.narg(boundary_to)::timestamp)
  AND i.updated_at >= sqlc.arg(updated_since)::timestamp
  AND (NOT sqlc.arg(has_cursor)::boolean
       OR (i.updated_at, i.id) > (sqlc.arg(cursor_at)::timestamp, sqlc.arg(cursor_id)::uuid))
ORDER BY i.updated_at, i.id
LIMIT sqlc.arg(page_size);


-- name: GetInvoice :one
SELECT *
FROM instance_invoice i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.id = sqlc.arg(id);


-- name: GetReplacementInvoiceID :one
-- The invoice recomposed from a VOID one, when there is one.
SELECT i.id
FROM instance_invoice i
WHERE i.replaces_invoice_id = sqlc.arg(id);


-- name: LockSubscriptionByID :one
-- An invoice action locks the invoice's subscription first, then the
-- invoice: the order every billing writer takes them in.
SELECT *
FROM instance_billing ib
WHERE ib.organization_id = sqlc.arg(organization_id)
  AND ib.id = sqlc.arg(id)
FOR UPDATE;


-- name: LockInvoice :one
SELECT *
FROM instance_invoice i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.id = sqlc.arg(id)
FOR UPDATE;


-- name: MarkInvoicePaid :one
-- A MANUAL invoice paid, as the organization recorded it. A handoff still
-- PENDING is acknowledged in the same write, its lease cleared.
UPDATE instance_invoice
SET status                     = 'PAID',
    paid_at                    = sqlc.arg(paid_at),
    marked_paid_by_id          = sqlc.arg(user_id),
    external_reference         = coalesce(sqlc.narg(external_reference), external_reference),
    handoff_status             = CASE WHEN handoff_status = 'PENDING' THEN 'ACKNOWLEDGED'::handoff_status ELSE handoff_status END,
    handoff_acknowledged_at    = CASE WHEN handoff_status = 'PENDING' THEN sqlc.arg(now) ELSE handoff_acknowledged_at END,
    handoff_acknowledged_by_id = CASE WHEN handoff_status = 'PENDING' THEN sqlc.arg(user_id) ELSE handoff_acknowledged_by_id END,
    handoff_lease_id           = NULL,
    handoff_leased_until       = NULL,
    updated_at                 = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: WriteOffInvoice :one
UPDATE instance_invoice
SET status           = 'UNCOLLECTIBLE',
    uncollectible_at = sqlc.arg(now),
    updated_at       = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: VoidInvoice :one
-- A void leaves the invoice's identity key free for a recompose. A held
-- draft voided gives up its hold: only a DRAFT can be held.
UPDATE instance_invoice
SET status       = 'VOID',
    voided_at    = sqlc.arg(now),
    voided_by_id = sqlc.arg(user_id),
    void_reason  = sqlc.arg(reason),
    hold_reason  = NULL,
    hold_detail  = NULL,
    held_at      = NULL,
    next_push_at = NULL,
    updated_at   = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: RewriteInvoice :one
-- A held draft recomposed in place, or released: its lines and totals, its
-- hold, and -- when it leaves the hold -- its issue, written whole.
UPDATE instance_invoice
SET lines                = sqlc.arg(lines),
    service_from         = sqlc.arg(service_from),
    service_to           = sqlc.arg(service_to),
    subtotal_minor       = sqlc.arg(subtotal_minor),
    discount_total_minor = sqlc.arg(discount_total_minor),
    total_minor          = sqlc.arg(total_minor),
    status               = sqlc.arg(status),
    hold_reason          = sqlc.narg(hold_reason),
    hold_detail          = sqlc.narg(hold_detail),
    held_at              = sqlc.narg(held_at),
    hold_released_at     = sqlc.narg(hold_released_at),
    hold_released_by_id  = sqlc.narg(hold_released_by_id),
    hold_release_reason  = sqlc.narg(hold_release_reason),
    issued_at            = sqlc.narg(issued_at),
    days_until_due       = sqlc.narg(days_until_due),
    due_at               = sqlc.narg(due_at),
    paid_at              = sqlc.narg(paid_at),
    handoff_status       = sqlc.arg(handoff_status),
    next_push_at         = sqlc.narg(next_push_at),
    updated_at           = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: ListHeldInvoices :many
-- Held drafts, oldest first, for the close to check again.
SELECT i.id, i.organization_id
FROM instance_invoice i
WHERE i.hold_reason IS NOT NULL
ORDER BY i.held_at, i.id
LIMIT sqlc.arg(page_size);


-- name: GetHeldInvoice :one
SELECT i.id, i.organization_id, i.instance_billing_id
FROM instance_invoice i
WHERE i.id = sqlc.arg(id)
  AND i.hold_reason IS NOT NULL;


-- name: ListSessionInvoices :many
-- One page of what a customer session may read: its customer's invoices by
-- id -- never by slug, which another customer may since have taken -- and, for
-- a session bound to an instance, that instance's only. Issued invoices only:
-- a DRAFT, a held one or one still failing its push is the vendor's business.
-- Newest boundary first; fetched one row past the page.
SELECT *
FROM instance_invoice i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.customer_id = sqlc.arg(customer_id)
  AND (sqlc.narg(instance_id)::uuid IS NULL
       OR i.instance_billing_id IN (SELECT ib.id
                                    FROM instance_billing ib
                                    WHERE ib.organization_id = i.organization_id
                                      AND ib.instance_id = sqlc.narg(instance_id)::uuid))
  AND i.status IN ('MANUAL', 'PUSHED', 'PAID', 'PAYMENT_FAILED', 'UNCOLLECTIBLE', 'VOID')
  AND (NOT sqlc.arg(has_cursor)::boolean
       OR (i.boundary_at, i.id) < (sqlc.arg(cursor_at)::timestamp, sqlc.arg(cursor_id)::uuid))
ORDER BY i.boundary_at DESC, i.id DESC
LIMIT sqlc.arg(page_size);
