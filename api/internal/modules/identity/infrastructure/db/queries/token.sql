-- name: CreateToken :one
-- u.organization_id = uoo.organization_id excludes the orgless system:kaiten
-- identity, which holds a membership in every organization -- see
-- GetServiceAccount. Tokens for it are minted by CreateSystemOrganizationToken,
-- which resolves the owner by external id instead, so this query stays purely
-- about tenant service accounts.
WITH service_account AS (SELECT u.id
                         FROM "user" u
                                INNER JOIN user_on_organization uoo ON u.id = uoo.user_id
                         WHERE u.slug = sqlc.arg(service_account_slug)
                           AND uoo.organization_id = sqlc.arg(organization_id)
                           AND u.organization_id = uoo.organization_id
                           AND u.type = 'machine'
                           AND u.deleted_at IS NULL
                           AND uoo.deleted_at IS NULL),
     creator AS (SELECT id, name
                 FROM "user" u
                 WHERE u.id = sqlc.arg(creator_id)),
     organization_info AS (SELECT id
                           FROM organization
                           WHERE id = sqlc.arg(organization_id)),
     inserted_token AS (
       INSERT INTO token (
                          hash,
                          lookup_hash,
                          created_by,
                          expires_at,
                          service_account_id,
                          organization_id,
                          scopes,
                          name,
                          slug
         )
         SELECT sqlc.arg(hash),
                sqlc.arg(lookup_hash),
                creator.id,
                sqlc.narg(expires_at),
                service_account.id,
                organization_info.id,
                sqlc.arg(scopes),
                sqlc.arg(name),
                sqlc.arg(slug)
         FROM service_account,
              creator,
              organization_info
         RETURNING *)
SELECT inserted_token.*,
       service_account.id AS service_account_id,
       creator.name       AS created_by_name
FROM inserted_token
       CROSS JOIN service_account
       CROSS JOIN creator;


-- name: GetToken :one
SELECT t.id,
       t.hash,
       t.created_by,
       t.created_at,
       t.expires_at,
       t.service_account_id,
       t.revoked_by,
       t.revoked_date,
       t.organization_id,
       t.scopes,
       t.name,
       t.slug,
       u.id           AS service_account_id,
       creator.name   AS created_by_name,
       revoker.name   AS revoked_by_name
FROM token t
       INNER JOIN "user" u ON t.service_account_id = u.id
       INNER JOIN "user" creator ON t.created_by = creator.id
       LEFT JOIN "user" revoker ON t.revoked_by = revoker.id
WHERE t.id = sqlc.arg(token_id)
  AND t.organization_id = sqlc.arg(organization_id);


-- name: ListTokensForServiceAccount :many
-- Unbounded on purpose: also used by getserviceaccount (the single-
-- service-account detail view), which needs every token for that one
-- service account, not just one page.
-- ListTokensForServiceAccountByCursor (below) is the cursor-paginated
-- variant for the list-facing caller (REST getserviceaccounttokens).
SELECT t.id,
       t.hash,
       t.created_by,
       t.created_at,
       t.expires_at,
       t.service_account_id,
       t.revoked_by,
       t.revoked_date,
       t.organization_id,
       t.scopes,
       t.name,
       t.slug,
       u.id           AS service_account_id,
       creator.name   AS created_by_name,
       revoker.name   AS revoked_by_name
FROM token t
       INNER JOIN "user" u ON t.service_account_id = u.id
       INNER JOIN "user" creator ON t.created_by = creator.id
       LEFT JOIN "user" revoker ON t.revoked_by = revoker.id
-- u.organization_id = t.organization_id is the token-side twin of CreateToken's
-- membership predicate: a no-op for a real service account (createserviceaccount
-- writes the user's organization_id and its token's organization_id from the same
-- value) and false for the orgless system:kaiten, whose u.organization_id is NULL.
-- Without it, an org token minted for the platform identity by the Platform API
-- would be listed -- and revocable -- inside a tenant whose Core API cannot even
-- fetch its owner. Platform-minted credentials are revoked from the Platform API.
WHERE u.slug = sqlc.arg(service_account_slug)
  AND t.organization_id = sqlc.arg(organization_id)
  AND u.organization_id = t.organization_id
  AND u.type = 'machine'
  AND u.deleted_at IS NULL
ORDER BY t.created_at DESC;


-- name: ListTokensForServiceAccountByCursor :many
-- Cursor (keyset) pagination: ordered by created_at DESC, id DESC (id
-- tie-breaks created_at, which is not guaranteed unique). Pass
-- limit_plus_one = requested limit + 1 so the caller can detect whether a
-- further page exists without a separate COUNT query. On the first page,
-- pass NULL for both cursor_created_at and cursor_id.
SELECT t.id,
       t.hash,
       t.created_by,
       t.created_at,
       t.expires_at,
       t.service_account_id,
       t.revoked_by,
       t.revoked_date,
       t.organization_id,
       t.scopes,
       t.name,
       t.slug,
       u.id           AS service_account_id,
       creator.name   AS created_by_name,
       revoker.name   AS revoked_by_name
FROM token t
       INNER JOIN "user" u ON t.service_account_id = u.id
       INNER JOIN "user" creator ON t.created_by = creator.id
       LEFT JOIN "user" revoker ON t.revoked_by = revoker.id
-- u.organization_id = t.organization_id: see ListTokensForServiceAccount.
WHERE u.slug = sqlc.arg(service_account_slug)
  AND t.organization_id = sqlc.arg(organization_id)
  AND u.organization_id = t.organization_id
  AND u.type = 'machine'
  AND u.deleted_at IS NULL
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (t.created_at, t.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY t.created_at DESC, t.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: ListTokensForServiceAccounts :many
SELECT t.id,
       t.hash,
       t.created_by,
       t.created_at,
       t.expires_at,
       t.service_account_id,
       t.revoked_by,
       t.revoked_date,
       t.organization_id,
       t.scopes,
       t.name,
       t.slug,
       u.id           AS service_account_id,
       u.slug        AS service_account_slug,
       creator.name   AS created_by_name,
       revoker.name   AS revoked_by_name
FROM token t
       INNER JOIN "user" u ON t.service_account_id = u.id
       INNER JOIN "user" creator ON t.created_by = creator.id
       LEFT JOIN "user" revoker ON t.revoked_by = revoker.id
-- u.organization_id = t.organization_id: see ListTokensForServiceAccount.
WHERE u.slug = ANY (sqlc.arg(service_account_slugs)::text[])
  AND t.organization_id = sqlc.arg(organization_id)
  AND u.organization_id = t.organization_id
  AND u.type = 'machine'
  AND u.deleted_at IS NULL
ORDER BY u.id, t.created_at DESC;


-- name: RevokeToken :one
WITH revoker AS (SELECT id
                                                         FROM "user" u
                                                         WHERE u.id = sqlc.arg(revoker_id)),
               service_account AS (SELECT u.id
                                                                                     FROM "user" u
                                                                                                                INNER JOIN user_on_organization uoo ON u.id = uoo.user_id
                                                                                     WHERE u.slug = sqlc.arg(service_account_slug)
                                                                                            AND uoo.organization_id = sqlc.arg(organization_id)
                                                                                            AND u.organization_id = uoo.organization_id
                                                                                            AND u.type = 'machine'
                                                                                            AND u.deleted_at IS NULL
                                                                                            AND uoo.deleted_at IS NULL)
UPDATE token
SET revoked_by   = revoker.id,
              revoked_date = now()
FROM revoker,
               service_account
WHERE token.slug = sqlc.arg(token_slug)
       AND token.service_account_id = service_account.id
       AND token.organization_id = sqlc.arg(organization_id)
       AND token.revoked_date IS NULL
RETURNING token.id, token.lookup_hash;



-- name: GetActiveTokenByLookupHash :one
-- The organization join carries no liveness predicate, unlike the "user" one:
-- organizations are hard-deleted and token.organization_id cascades, so a
-- token whose organization is gone no longer exists to be matched. Users are
-- soft-deleted, so theirs still has to be checked.
--
-- kind = 'organization' is implied by the organization join (a platform token has
-- no organization_id), but stating it makes this path declare its intent: it is
-- the only place an *unsigned* JWT is minted, so a platform credential must be
-- unable to reach it even if the join ever changes.
--
-- expires_at is selected so the caller can clamp the JWT's own exp to it, or a
-- 15-minute token yields a JWT valid for the full default lifetime.
SELECT t.hash,
       t.service_account_id,
       t.organization_id,
       t.scopes,
       t.expires_at,
       u.external_id AS service_account_external_id,
       o.external_id AS organization_external_id
FROM token t
       JOIN "user" u ON u.id = t.service_account_id
       JOIN organization o ON o.id = t.organization_id
WHERE t.lookup_hash = sqlc.arg(lookup_hash)
  AND t.kind = 'organization'
  AND t.revoked_date IS NULL
  AND u.deleted_at IS NULL
  AND (t.expires_at IS NULL OR t.expires_at > now());
