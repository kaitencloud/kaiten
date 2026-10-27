-- name: CreatePublishableKey :one
-- The id is the caller's: a Turnstile secret is written to Vault under it
-- before the row exists (V32-01).
INSERT INTO publishable_key (id, organization_id, label, lookup_hash, key_hint, allowed_origins,
                             anonymous_checkout, turnstile_site_key, turnstile_secret_set_at,
                             created_by_id, updated_by_id)
VALUES (sqlc.arg(id), sqlc.arg(organization_id), sqlc.arg(label), sqlc.arg(lookup_hash), sqlc.arg(key_hint),
        sqlc.arg(allowed_origins)::text[], sqlc.arg(anonymous_checkout), sqlc.narg(turnstile_site_key),
        sqlc.narg(turnstile_secret_set_at), sqlc.arg(actor_id), sqlc.arg(actor_id))
RETURNING *;


-- name: ListPublishableKeys :many
-- Newest first. Revoked keys only on request: they authenticate nothing and
-- are kept for the audit of who held what.
SELECT *
FROM publishable_key
WHERE organization_id = sqlc.arg(organization_id)
  AND (sqlc.arg(include_revoked)::boolean OR revoked_at IS NULL)
  AND (sqlc.narg(cursor_at)::timestamp IS NULL
    OR (created_at, id) < (sqlc.narg(cursor_at)::timestamp, sqlc.narg(cursor_id)::uuid))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.narg(row_limit)::integer;


-- name: GetPublishableKeyForUpdate :one
SELECT *
FROM publishable_key
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id)
FOR UPDATE;


-- name: UpdatePublishableKey :one
-- The caller has locked the row and checked it is live. Each member is
-- replaced only when given; set_site_key and set_secret write their value,
-- NULL clearing it.
UPDATE publishable_key
SET label                   = coalesce(sqlc.narg(label), label),
    allowed_origins         = coalesce(sqlc.narg(allowed_origins)::text[], allowed_origins),
    anonymous_checkout      = coalesce(sqlc.narg(anonymous_checkout)::boolean, anonymous_checkout),
    turnstile_site_key      = CASE
                                WHEN sqlc.arg(set_site_key)::boolean THEN sqlc.narg(turnstile_site_key)::text
                                ELSE turnstile_site_key
                              END,
    turnstile_secret_set_at = CASE
                                WHEN sqlc.arg(set_secret)::boolean THEN sqlc.narg(turnstile_secret_set_at)::timestamp
                                ELSE turnstile_secret_set_at
                              END,
    updated_at              = CURRENT_TIMESTAMP,
    updated_by_id           = sqlc.arg(actor_id)
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id)
RETURNING *;


-- name: RevokePublishableKey :one
-- Idempotent: a key already revoked keeps its first revocation. Its Turnstile
-- secret is deleted from Vault after the commit (§13.12), so the row stops
-- saying it holds one.
UPDATE publishable_key
SET revoked_at              = coalesce(revoked_at, CURRENT_TIMESTAMP),
    revoked_by_id           = coalesce(revoked_by_id, sqlc.arg(actor_id)::uuid),
    turnstile_secret_set_at = NULL,
    updated_at              = CASE WHEN revoked_at IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END,
    updated_by_id           = CASE WHEN revoked_at IS NULL THEN sqlc.arg(actor_id) ELSE updated_by_id END
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id)
RETURNING *;


-- name: AuthenticatePublishableKey :one
-- Answered from idx_publishable_key_lookup_hash_active alone.
SELECT id, organization_id, allowed_origins
FROM publishable_key
WHERE lookup_hash = sqlc.arg(lookup_hash)
  AND revoked_at IS NULL;


-- name: TouchPublishableKey :exec
-- last_used_at moves at most once a minute per key, so a busy storefront
-- does not turn every page view into a row write.
UPDATE publishable_key
SET last_used_at = CURRENT_TIMESTAMP
WHERE id = sqlc.arg(id)
  AND (last_used_at IS NULL OR last_used_at < CURRENT_TIMESTAMP - INTERVAL '1 minute');


-- name: GetPublishableKeyCheckout :one
-- What the catalogue says of the key that reads it (§14.4): whether it opens
-- the anonymous checkout, and the Turnstile site key the page renders.
SELECT anonymous_checkout, turnstile_site_key, (turnstile_secret_set_at IS NOT NULL)::boolean AS secret_set, allowed_origins
FROM publishable_key
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id)
  AND revoked_at IS NULL;
