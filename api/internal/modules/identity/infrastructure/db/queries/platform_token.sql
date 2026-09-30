-- Queries for the platform credential class (token.kind = 'platform') and for
-- the organization tokens it mints.
--
-- Two invariants hold across this whole file:
--
--   * No query here selects token.organization_id. The generated Go type for
--     that column is pinned to a non-pointer uuid.UUID (see sqlc.yaml), which is
--     only sound because no path that can return a kind='platform' row -- where
--     the column is NULL -- ever reads it.
--   * The owner is resolved by external_id = 'system:kaiten', never by the
--     literal UUID the migration pins. A database whose identity row went
--     missing then errors instead of writing a dangling credential.

-- name: GetActivePlatformTokenByLookupHash :one
-- The authentication path for a ksm_ credential. There is no organization join
-- because a platform token has no organization -- which is also why this cannot
-- share GetActiveTokenByLookupHash: that query's join is what makes an
-- organization JWT possible, and the two must not be reachable from one lookup.
SELECT t.id,
       t.hash,
       t.service_account_id,
       t.scopes,
       t.expires_at,
       u.external_id AS service_account_external_id
FROM token t
       JOIN "user" u ON u.id = t.service_account_id
WHERE t.lookup_hash = sqlc.arg(lookup_hash)
  AND t.kind = 'platform'
  AND t.revoked_date IS NULL
  AND u.deleted_at IS NULL
  AND (t.expires_at IS NULL OR t.expires_at > now());


-- name: GetPlatformTokenByID :one
-- Introspection for GET /api/platform/me. Never the hash, never the lookup hash:
-- this answers "which credential am I holding", not "what is its secret".
SELECT t.id,
       t.name,
       t.slug,
       t.scopes,
       t.created_at,
       t.expires_at
FROM token t
WHERE t.id = sqlc.arg(token_id)
  AND t.kind = 'platform'
  AND t.revoked_date IS NULL
  AND (t.expires_at IS NULL OR t.expires_at > now());


-- name: CreatePlatformToken :one
-- Called only by kaiten-admin-tools: a platform token cannot issue another one
-- (token_platform_has_no_parent enforces the same rule in the schema).
-- organization_id is left out of the column list rather than written as NULL --
-- the absence is the point, and token_platform_is_orgless_system checks it.
--
-- The returned columns are listed explicitly rather than RETURNING *, so
-- organization_id is never read -- see the file header.
--
-- The CTE is named platform_identity, not system_user: SYSTEM_USER is a reserved
-- word in PostgreSQL 16+ and sqlc's parser rejects it as an unquoted identifier.
WITH platform_identity AS (SELECT u.id
                           FROM "user" u
                           WHERE u.external_id = 'system:kaiten'
                             AND u.deleted_at IS NULL)
INSERT INTO token (kind, hash, lookup_hash, created_by, expires_at,
                   service_account_id, scopes, name, slug)
SELECT 'platform'::token_kind,
       sqlc.arg(hash),
       sqlc.arg(lookup_hash),
       platform_identity.id,
       sqlc.narg(expires_at),
       platform_identity.id,
       sqlc.arg(scopes),
       sqlc.arg(name),
       sqlc.arg(slug)
FROM platform_identity
RETURNING id, name, slug, scopes, created_at, expires_at;


-- name: CreateSystemOrganizationToken :one
-- The mint: an ordinary kind='organization' token owned by system:kaiten inside
-- one organization. It cannot reuse CreateToken, because that query now requires
-- u.organization_id = uoo.organization_id and so deliberately excludes this
-- orgless owner.
--
-- Membership is resolved *inside* the INSERT, so it cannot be checked and then
-- raced: zero rows means system:kaiten has no live membership in the target and
-- the caller gets pgx.ErrNoRows. Nothing here creates a membership -- that is the
-- organization trigger's job, and its absence is a platform invariant breach,
-- not something to paper over.
--
-- The owner is returned as well as used: the response is an ordinary
-- schema.PlainToken, whose ServiceAccountID and CreatedBy are system:kaiten's
-- membership in this organization. Resolving them here rather than in Go is what
-- makes them the SAME row the INSERT actually wrote -- a second lookup could
-- disagree with it.
WITH platform_identity AS (SELECT u.id, u.name
                           FROM "user" u
                           WHERE u.external_id = 'system:kaiten'
                             AND u.deleted_at IS NULL),
     membership AS (SELECT uoo.user_id, uoo.organization_id, platform_identity.name
                    FROM user_on_organization uoo
                           INNER JOIN platform_identity ON platform_identity.id = uoo.user_id
                    WHERE uoo.organization_id = sqlc.arg(organization_id)
                      AND uoo.deleted_at IS NULL),
     inserted_token AS (
       INSERT INTO token (kind, hash, lookup_hash, created_by, expires_at,
                          service_account_id, organization_id, scopes, name, slug,
                          issued_by_platform_token_id)
         SELECT 'organization'::token_kind,
                sqlc.arg(hash),
                sqlc.arg(lookup_hash),
                membership.user_id,
                sqlc.narg(expires_at),
                membership.user_id,
                membership.organization_id,
                sqlc.arg(scopes),
                sqlc.arg(name),
                sqlc.arg(slug),
                sqlc.narg(issued_by_platform_token_id)
         FROM membership
         RETURNING id, name, slug, scopes, created_at, expires_at,
           service_account_id, created_by)
SELECT inserted_token.id,
       inserted_token.name,
       inserted_token.slug,
       inserted_token.scopes,
       inserted_token.created_at,
       inserted_token.expires_at,
       inserted_token.service_account_id,
       inserted_token.created_by,
       membership.name AS created_by_name
FROM inserted_token,
     membership;


-- name: ListPlatformTokens :many
-- Includes revoked and expired rows: `platform-token list` is an inventory, and
-- a revoked credential's absence would hide exactly the history an operator
-- needs after a rotation.
SELECT t.id,
       t.name,
       t.slug,
       t.scopes,
       t.created_at,
       t.expires_at,
       t.revoked_date
FROM token t
WHERE t.kind = 'platform'
ORDER BY t.created_at DESC;


-- name: RevokePlatformTokenByName :one
-- Names are unique among *active* platform tokens
-- (uq_token_platform_name_active), so this matches at most one row. The revoker
-- is system:kaiten itself: revocation happens in kaiten-admin-tools, where there
-- is no acting user to attribute it to.
WITH platform_identity AS (SELECT u.id
                           FROM "user" u
                           WHERE u.external_id = 'system:kaiten'
                             AND u.deleted_at IS NULL)
UPDATE token
SET revoked_by   = platform_identity.id,
    revoked_date = now()
FROM platform_identity
WHERE token.name = sqlc.arg(name)
  AND token.kind = 'platform'
  AND token.revoked_date IS NULL
RETURNING token.id, token.lookup_hash;


-- name: RevokeTokensIssuedByPlatformToken :many
-- The cascade from decision 11. Runs in the same transaction as the parent's
-- revocation, and returns every lookup_hash so the caller can publish one cache
-- eviction per token -- otherwise a revoked child keeps authenticating for as
-- long as the validation cache holds it.
--
-- The ::uuid cast is not cosmetic: issued_by_platform_token_id is a nullable
-- column, so without it sqlc emits a *uuid.UUID parameter -- and a nil there
-- would match no row (= NULL is never true) while reporting success. The parent
-- id is always known, being the caller's own credential.
WITH platform_identity AS (SELECT u.id
                           FROM "user" u
                           WHERE u.external_id = 'system:kaiten'
                             AND u.deleted_at IS NULL)
UPDATE token
SET revoked_by   = platform_identity.id,
    revoked_date = now()
FROM platform_identity
WHERE token.issued_by_platform_token_id = sqlc.arg(platform_token_id)::uuid
  AND token.revoked_date IS NULL
RETURNING token.id, token.lookup_hash;


-- name: RevokeSystemOrganizationTokenBySlug :one
-- Early revocation of a minted token through the Platform API, before its parent
-- is retired. Scoped to the target organization and to tokens this platform
-- token issued, so one platform credential cannot revoke another's children. The
-- ::uuid cast forces a non-null parameter -- see
-- RevokeTokensIssuedByPlatformToken.
WITH platform_identity AS (SELECT u.id
                           FROM "user" u
                           WHERE u.external_id = 'system:kaiten'
                             AND u.deleted_at IS NULL)
UPDATE token
SET revoked_by   = platform_identity.id,
    revoked_date = now()
FROM platform_identity
WHERE token.slug = sqlc.arg(token_slug)
  AND token.organization_id = sqlc.arg(organization_id)
  AND token.issued_by_platform_token_id = sqlc.arg(platform_token_id)::uuid
  AND token.revoked_date IS NULL
RETURNING token.id, token.lookup_hash;


-- name: RevokeSystemOrganizationTokenByName :many
-- The revoke half of `kaiten-admin-tools service-token mint --replace`. By name,
-- not by slug: the name is what the operator chose and can name again on a
-- re-run, while the slug is server-generated and never reused. It is also
-- parent-agnostic, unlike RevokeSystemOrganizationTokenBySlug -- an operator at a
-- shell holds the database connection string and no platform credential, so the
-- token being replaced may have been issued by a parent that is long gone, or by
-- no parent at all.
--
-- Restricted to system:kaiten's own tokens: a platform tool must not be able to
-- revoke a tenant's service-account credentials by guessing a name. The partial
-- token_name index means at most one row is active per name, so the result is
-- always zero rows or one -- :many because "zero" is the ordinary case on a first
-- run and pgx.ErrNoRows would be the wrong way to say so.
WITH platform_identity AS (SELECT u.id
                           FROM "user" u
                           WHERE u.external_id = 'system:kaiten'
                             AND u.deleted_at IS NULL)
UPDATE token
SET revoked_by   = platform_identity.id,
    revoked_date = now()
FROM platform_identity
WHERE token.service_account_id = platform_identity.id
  AND token.name = sqlc.arg(name)
  AND token.organization_id = sqlc.arg(organization_id)
  AND token.revoked_date IS NULL
RETURNING token.id, token.lookup_hash;


-- name: PurgeRetiredTokens :execrows
-- Retired means revoked or expired -- a token that is neither is live and is
-- never touched here, whatever its age. Deleting a parent only nulls its
-- children's issued_by_platform_token_id (ON DELETE SET NULL); it does not
-- delete or revoke them.
--
-- One bounded batch, oldest first, so a table that has accumulated for months is
-- drained over many short transactions instead of one long one holding locks and
-- bloating WAL. SKIP LOCKED avoids waiting behind an unrelated transaction that is
-- touching a retired row -- a concurrent revoke of an already-expired credential,
-- for instance. Same shape as the transport-table purges in
-- internal/infrastructure/retention.
--
-- retired_at is coalesce(revoked_date, expires_at): for a row that is both, the
-- revocation is what retired it, and it is necessarily the earlier of the two for
-- ordering purposes only. Ordering by it, then by id, makes progress
-- deterministic across batches.
WITH retired AS (SELECT t.id
                 FROM token t
                 WHERE (t.revoked_date IS NOT NULL AND t.revoked_date < sqlc.arg(retired_before))
                    OR (t.expires_at IS NOT NULL AND t.expires_at < sqlc.arg(retired_before))
                 ORDER BY coalesce(t.revoked_date, t.expires_at), t.id
                 LIMIT sqlc.arg(batch_size)
                   FOR UPDATE SKIP LOCKED)
DELETE
FROM token t
  USING retired
WHERE t.id = retired.id;


-- name: ListSystemOrganizationTokensByPlatformToken :many
-- The credentials this platform credential currently holds in one organization.
--
-- It exists so a client can find a credential's SLUG from the NAME it chose. The
-- slug is server-generated with a random suffix (slugutil.GenerateUnique), and
-- revocation is addressed by slug -- so without this, a client that wanted to
-- retire a credential it had itself minted had no way to name it, and re-minting
-- under the same name is refused by the token_name constraint, so a supersede
-- path has no way to address the credential it needs to replace.
--
-- Read-only, and narrowed exactly like RevokeSystemOrganizationTokenBySlug: the
-- target organization, tokens this platform credential issued, still active. One
-- platform credential therefore cannot enumerate another's children, which is the
-- property that lets this be published at all -- a broader list would be a way to
-- discover credentials the caller has no business seeing.
--
-- No hash, no lookup_hash: nothing here can be used to authenticate as one of
-- these credentials, only to identify one for revocation. The ::uuid cast forces
-- a non-null parameter, as in the two revoke queries above.
SELECT token.id,
       token.name,
       token.slug,
       token.scopes,
       token.expires_at,
       token.created_at
FROM token
WHERE token.organization_id = sqlc.arg(organization_id)
  AND token.issued_by_platform_token_id = sqlc.arg(platform_token_id)::uuid
  AND token.revoked_date IS NULL
ORDER BY token.name;
