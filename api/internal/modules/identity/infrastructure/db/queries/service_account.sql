-- name: CreateServiceAccount :one
WITH creator AS (
    SELECT id
    FROM "user"
    WHERE "user".id = sqlc.arg(creator_id)
),
inserted AS (
    INSERT INTO "user" (name, slug, external_id, created_by_id, type, organization_id)
    SELECT sqlc.arg(name), sqlc.arg(slug), sqlc.arg(external_id), creator.id, 'machine', sqlc.arg(organization_id)
    FROM creator
    ON CONFLICT (external_id) DO NOTHING
    RETURNING *
)
SELECT inserted.id,
       inserted.external_id,
       inserted.created_at,
       inserted.created_by_id,
       c.name AS created_by_name,
       inserted.deleted_at,
       inserted.email,
       inserted.name,
       inserted.slug,
       inserted.type
FROM inserted
       LEFT JOIN "user" c ON inserted.created_by_id = c.id;


-- name: GetServiceAccount :one
-- u.organization_id = uoo.organization_id looks redundant next to the membership
-- join, and for a tenant service account it is: createserviceaccount writes the
-- column and the membership in one unit of work, so the two are always equal.
-- What it excludes is the system:kaiten platform identity, which has
-- organization_id IS NULL and a membership in *every* organization -- without
-- this predicate it would be fetchable, and therefore token-mintable and
-- revocable, from inside every tenant.
SELECT u.id,
       u.external_id,
       u.created_at,
       u.created_by_id,
       creator.name AS created_by_name,
       u.deleted_at,
       u.email,
       u.name,
       u.slug,
       u.type
FROM "user" u
       INNER JOIN user_on_organization uoo ON u.id = uoo.user_id
       LEFT JOIN "user" creator ON u.created_by_id = creator.id
WHERE u.slug = sqlc.arg(service_account_slug)
  AND uoo.organization_id = sqlc.arg(organization_id)
  AND u.organization_id = uoo.organization_id
  AND u.type = 'machine'
  AND u.deleted_at IS NULL
  AND uoo.deleted_at IS NULL;


-- name: GetServiceAccounts :many
-- Cursor (keyset) pagination: ordered by created_at DESC, id DESC (id
-- tie-breaks created_at, which is not guaranteed unique). Pass
-- limit_plus_one = requested limit + 1 so the caller can detect whether a
-- further page exists without a separate COUNT query. On the first page,
-- pass NULL for both cursor_created_at and cursor_id.
SELECT u.id,
       u.external_id,
       u.created_at,
       u.created_by_id,
       creator.name AS created_by_name,
       u.deleted_at,
       u.email,
       u.name,
       u.slug,
       u.type
FROM "user" u
       INNER JOIN user_on_organization uoo ON u.id = uoo.user_id
       LEFT JOIN "user" creator ON u.created_by_id = creator.id
WHERE uoo.organization_id = sqlc.arg(organization_id)
  -- See GetServiceAccount: keeps the orgless system:kaiten identity out of every
  -- tenant's service-account list.
  AND u.organization_id = uoo.organization_id
  AND u.type = 'machine'
  AND u.deleted_at IS NULL
  AND uoo.deleted_at IS NULL
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (u.created_at, u.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY u.created_at DESC, u.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: UpdateServiceAccountName :execresult
UPDATE "user"
SET name = sqlc.arg(name)
WHERE slug = sqlc.arg(slug)
  AND organization_id = sqlc.arg(organization_id)
  AND type = 'machine'
  AND deleted_at IS NULL
RETURNING *;
