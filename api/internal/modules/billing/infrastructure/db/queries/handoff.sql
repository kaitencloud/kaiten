-- name: ClaimHandoff :many
-- Leases up to page_size PENDING invoices whose lease is free, oldest issue
-- first. SKIP LOCKED: two consumers claiming at once get disjoint invoices.
-- An expired lease is free again, which is what makes the queue
-- at-least-once.
WITH picked AS (
  SELECT i.id
  FROM instance_invoice i
  WHERE i.organization_id = sqlc.arg(organization_id)
    AND i.handoff_status = 'PENDING'
    AND (i.handoff_leased_until IS NULL OR i.handoff_leased_until <= sqlc.arg(now))
  ORDER BY i.issued_at, i.id
  LIMIT sqlc.arg(page_size)
  FOR UPDATE SKIP LOCKED
)
UPDATE instance_invoice inv
SET handoff_lease_id     = sqlc.arg(lease_id),
    handoff_leased_until = sqlc.arg(leased_until),
    handoff_claim_count  = inv.handoff_claim_count + 1,
    updated_at           = sqlc.arg(now)
FROM picked
WHERE inv.id = picked.id
RETURNING inv.*;


-- name: AcknowledgeHandoff :one
-- Leaving PENDING clears the lease: a lease exists only while PENDING.
UPDATE instance_invoice
SET handoff_status             = 'ACKNOWLEDGED',
    handoff_acknowledged_at    = sqlc.arg(now),
    handoff_acknowledged_by_id = sqlc.arg(user_id),
    handoff_lease_id           = NULL,
    handoff_leased_until       = NULL,
    external_reference         = coalesce(sqlc.narg(external_reference), external_reference),
    updated_at                 = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: FillHandoffReference :one
-- An acknowledged invoice that had no reference gets the one a later
-- acknowledgement gives.
UPDATE instance_invoice
SET external_reference = sqlc.arg(external_reference),
    updated_at         = sqlc.arg(now)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: ListHandoff :many
-- One page of an organization's handoff queue in one status, oldest issue
-- first. Reading never leases.
SELECT *
FROM instance_invoice i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.handoff_status = sqlc.arg(handoff_status)
  AND (NOT sqlc.arg(has_cursor)::boolean
       OR (i.issued_at, i.id) > (sqlc.arg(cursor_at)::timestamp, sqlc.arg(cursor_id)::uuid))
ORDER BY i.issued_at, i.id
LIMIT sqlc.arg(page_size);
