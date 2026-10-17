-- name: GetSessionCustomer :one
-- The customer a session is minted for, by slug.
SELECT id, slug
FROM customer
WHERE organization_id = sqlc.arg(organization_id)
  AND slug = sqlc.arg(slug);


-- name: GetSessionInstance :one
-- The instance a session is bound to, by slug, with the customer it belongs to.
SELECT id, slug, customer_id
FROM instance
WHERE organization_id = sqlc.arg(organization_id)
  AND slug = sqlc.arg(slug);


-- name: CreateCustomerSession :one
-- created_at and expires_at come from the one statement clock, so the TTL
-- CHECK sees exactly the TTL asked for.
INSERT INTO customer_session (organization_id, customer_id, instance_id, lookup_hash, created_by_id, created_at, expires_at)
VALUES (sqlc.arg(organization_id), sqlc.arg(customer_id), sqlc.narg(instance_id), sqlc.arg(lookup_hash), sqlc.arg(actor_id),
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + make_interval(secs => sqlc.arg(ttl_seconds)::double precision))
RETURNING id, expires_at;


-- name: RevokeCustomerSession :one
-- Idempotent: a session already revoked keeps its first revocation.
UPDATE customer_session
SET revoked_at    = coalesce(revoked_at, CURRENT_TIMESTAMP),
    revoked_by_id = coalesce(revoked_by_id, sqlc.arg(actor_id)::uuid)
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id)
RETURNING id;


-- name: AuthenticateCustomerSession :one
-- A live session -- unrevoked, unexpired -- with what it is bound to, and the
-- browser origins it may be used from: the union of its organization's live
-- publishable keys' origins. A bound instance that has since moved to another
-- customer no longer authenticates: the session would otherwise reach an
-- instance its customer does not hold.
SELECT s.id,
       s.organization_id,
       s.created_by_id,
       s.customer_id,
       c.slug AS customer_slug,
       s.instance_id,
       i.slug AS instance_slug,
       (SELECT coalesce(array_agg(DISTINCT origin ORDER BY origin), '{}')
        FROM publishable_key pk, unnest(pk.allowed_origins) AS origin
        WHERE pk.organization_id = s.organization_id
          AND pk.revoked_at IS NULL)::text[] AS allowed_origins
FROM customer_session s
JOIN customer c ON c.id = s.customer_id AND c.organization_id = s.organization_id
LEFT JOIN instance i ON i.id = s.instance_id AND i.organization_id = s.organization_id
WHERE s.lookup_hash = sqlc.arg(lookup_hash)
  AND s.revoked_at IS NULL
  AND s.expires_at > CURRENT_TIMESTAMP
  AND (s.instance_id IS NULL OR i.customer_id = s.customer_id);


-- name: PurgeExpiredCustomerSessions :execrows
-- Sessions expired for a day are of no further use; deleted in small batches
-- as new ones are minted, so the table holds roughly the sessions in use.
DELETE
FROM customer_session
WHERE id IN (SELECT expired.id
             FROM customer_session expired
             WHERE expired.organization_id = sqlc.arg(organization_id)
               AND expired.expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'
             LIMIT 500);
