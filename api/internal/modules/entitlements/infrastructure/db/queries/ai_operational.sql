-- name: LockOperationalEntitlement :one
-- External mutation preflight holds the immutable catalogue identity until its
-- transaction finishes, so a slug cannot be deleted/recreated as an AI target.
SELECT e.id, e.type FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id) AND e.slug = sqlc.arg(slug)
FOR UPDATE;
