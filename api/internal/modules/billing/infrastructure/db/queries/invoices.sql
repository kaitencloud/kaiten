-- name: InsertInvoice :one
INSERT INTO instance_invoice (organization_id, instance_billing_id, customer_id, instance_slug, instance_name,
                              customer_slug, customer_name, license_id, license_slug, billing_email, kind,
                              boundary_at, service_from, service_to, currency, subtotal_minor,
                              discount_total_minor, total_minor, lines, status, hold_reason, hold_detail, held_at,
                              provider_kind, collection_method, issued_at, days_until_due, due_at, paid_at,
                              replaces_invoice_id, handoff_status, created_at, updated_at)
VALUES (sqlc.arg(organization_id), sqlc.arg(instance_billing_id), sqlc.narg(customer_id), sqlc.arg(instance_slug),
        sqlc.arg(instance_name), sqlc.arg(customer_slug), sqlc.arg(customer_name), sqlc.arg(license_id),
        sqlc.arg(license_slug), sqlc.narg(billing_email), sqlc.arg(kind), sqlc.arg(boundary_at),
        sqlc.arg(service_from), sqlc.arg(service_to), sqlc.arg(currency), sqlc.arg(subtotal_minor),
        sqlc.arg(discount_total_minor), sqlc.arg(total_minor), sqlc.arg(lines), sqlc.arg(status),
        sqlc.narg(hold_reason), sqlc.narg(hold_detail), sqlc.narg(held_at), sqlc.arg(provider_kind),
        sqlc.arg(collection_method), sqlc.narg(issued_at), sqlc.narg(days_until_due), sqlc.narg(due_at),
        sqlc.narg(paid_at), sqlc.narg(replaces_invoice_id), sqlc.arg(handoff_status), sqlc.arg(now), sqlc.arg(now))
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
       OR (i.status IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED') AND i.due_at < sqlc.arg(now)::timestamp))
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
       OR (i.status IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED') AND i.due_at < sqlc.arg(now)::timestamp))
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
