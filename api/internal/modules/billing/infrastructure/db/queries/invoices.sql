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
