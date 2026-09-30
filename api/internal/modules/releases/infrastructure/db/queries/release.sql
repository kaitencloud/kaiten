-- name: GetReleases :many
-- Cursor (keyset) pagination: ordered by created_at DESC, id DESC (id
-- tie-breaks created_at, which is not guaranteed unique). Pass
-- limit_plus_one = requested limit + 1 so the caller can detect whether a
-- further page exists without a separate COUNT query. On the first page,
-- pass NULL for both cursor_created_at and cursor_id.
SELECT r.id,
       r.version,
       r.slug,
       r.description,
       r.created_at,
       r.created_by_id,
       creator.name AS created_by_name,
       r.organization_id
FROM release r
  INNER JOIN "user" creator ON r.created_by_id = creator.id
WHERE r.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (r.created_at, r.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY r.created_at DESC, r.id DESC
LIMIT sqlc.arg(limit_plus_one);

-- name: GetOneRelease :one
SELECT r.id,
       r.version,
       r.slug,
       r.description,
       r.created_at,
       r.created_by_id,
       creator.name AS created_by_name,
       r.organization_id
FROM release r
  INNER JOIN "user" creator ON r.created_by_id = creator.id
WHERE r.organization_id = sqlc.arg(organization_id)
  AND r.id = sqlc.arg(release_id);

-- name: GetOneReleaseBySlug :one
SELECT r.id,
       r.version,
       r.slug,
       r.description,
       r.created_at,
       r.created_by_id,
       creator.name AS created_by_name,
       r.organization_id
FROM release r
  INNER JOIN "user" creator ON r.created_by_id = creator.id
WHERE r.organization_id = sqlc.arg(organization_id)
  AND r.slug = sqlc.arg(slug);

-- name: CreateRelease :one
-- A release is write-once: this is the only statement that writes the table
-- (nothing UPDATEs it), which is why it carries no updated_* columns.
WITH inserted AS (
  INSERT INTO release (version, slug, description, created_at, created_by_id, organization_id)
  SELECT $1, $2, $3, now(), uo.user_id, uo.organization_id
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
    AND uo.user_id = sqlc.arg(user_id)
    AND uo.deleted_at IS NULL
  RETURNING *
)
SELECT inserted.*,
       creator.name AS created_by_name
FROM inserted
  INNER JOIN "user" creator ON inserted.created_by_id = creator.id;

-- name: DeleteRelease :one
WITH deleted AS (
  DELETE FROM release r
  WHERE r.id = sqlc.arg(release_id)
    AND r.organization_id = sqlc.arg(organization_id)
  RETURNING r.*
)
SELECT deleted.*,
       creator.name AS created_by_name
FROM deleted
  INNER JOIN "user" creator ON deleted.created_by_id = creator.id;

-- name: DeleteReleaseBySlug :one
WITH deleted AS (
  DELETE FROM release r
  WHERE r.slug = sqlc.arg(slug)
    AND r.organization_id = sqlc.arg(organization_id)
  RETURNING r.*
)
SELECT deleted.*,
       creator.name AS created_by_name
FROM deleted
  INNER JOIN "user" creator ON deleted.created_by_id = creator.id;
