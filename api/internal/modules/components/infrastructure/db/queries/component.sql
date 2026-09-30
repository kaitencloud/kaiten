-- name: CreateComponent :one
WITH inserted AS (
  INSERT INTO component (name, version, slug, description, previous_component_id, created_by_id, organization_id)
  SELECT $1, $2, $3, $4, $5, uo.user_id, uo.organization_id
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


-- name: UpdateComponent :one
UPDATE component
SET name = COALESCE(sqlc.narg(new_name), name),
    version = COALESCE(sqlc.narg(new_version), version),
    slug = COALESCE(sqlc.narg(new_slug), slug),
    description = COALESCE(sqlc.narg(new_description), description)
WHERE id = sqlc.arg(component_id)
  AND organization_id = sqlc.arg(organization_id)
RETURNING id, previous_component_id, name, version, slug, description, created_at, created_by_id, organization_id;


-- name: GetComponents :many
-- Cursor (keyset) pagination: ordered by created_at DESC, id DESC (id
-- tie-breaks created_at, which is not guaranteed unique). This replaces
-- the previous ORDER BY name ASC, version DESC, created_at DESC -- a
-- mixed-direction, multi-column sort that isn't expressible as a single
-- keyset comparison without a much more complex predicate; consistency
-- with every other paginated endpoint's (created_at, id) convention was
-- judged more valuable than preserving that incidental grouping, and no
-- endpoint contract ever documented it as guaranteed. Pass
-- limit_plus_one = requested limit + 1 so the caller can detect whether a
-- further page exists without a separate COUNT query. On the first page,
-- pass NULL for both cursor_created_at and cursor_id.
SELECT c.*,
       creator.name AS created_by_name
FROM component c
  INNER JOIN "user" creator ON c.created_by_id = creator.id
WHERE c.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (c.created_at, c.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY c.created_at DESC, c.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: GetComponentByID :one
SELECT c.*,
       creator.name AS created_by_name
FROM component c
  INNER JOIN "user" creator ON c.created_by_id = creator.id
WHERE c.id = sqlc.arg(component_id)
  AND c.organization_id = sqlc.arg(organization_id);


-- name: GetComponentBySlug :one
SELECT c.*,
       creator.name AS created_by_name
FROM component c
  INNER JOIN "user" creator ON c.created_by_id = creator.id
WHERE c.slug = sqlc.arg(slug)
  AND c.organization_id = sqlc.arg(organization_id);


-- name: GetComponentsByReleaseID :many
SELECT c.*,
       creator.name AS created_by_name
FROM component c
  INNER JOIN component_release cr ON cr.component_id = c.id
  INNER JOIN "user" creator ON c.created_by_id = creator.id
WHERE cr.release_id = sqlc.arg(release_id)
  AND cr.organization_id = sqlc.arg(organization_id);


-- name: CountReleaseLinksByComponentID :one
SELECT COUNT(*)::bigint
FROM component_release cr
WHERE cr.component_id = sqlc.arg(component_id)
  AND cr.organization_id = sqlc.arg(organization_id);


-- name: AddComponentToRelease :exec
INSERT INTO component_release (component_id, release_id, organization_id)
VALUES ($1, $2, $3);


-- name: RemoveComponentFromRelease :exec
DELETE FROM component_release
WHERE component_id = sqlc.arg(component_id)
  AND release_id = sqlc.arg(release_id)
  AND organization_id = sqlc.arg(organization_id);


-- name: CopyComponentsFromRelease :exec
INSERT INTO component_release (component_id, release_id, organization_id)
SELECT cr.component_id, sqlc.arg(new_release_id), cr.organization_id
FROM component_release cr
WHERE cr.release_id = sqlc.arg(source_release_id)
  AND cr.organization_id = sqlc.arg(organization_id);


-- name: RemoveAllComponentsFromRelease :exec
DELETE FROM component_release
WHERE release_id = sqlc.arg(release_id)
  AND organization_id = sqlc.arg(organization_id);


-- name: DeleteComponentBySlug :one
WITH deleted AS (
  DELETE FROM component c
  WHERE c.slug = sqlc.arg(slug)
    AND c.organization_id = sqlc.arg(organization_id)
  RETURNING *
)
SELECT deleted.*,
       creator.name AS created_by_name
FROM deleted
  INNER JOIN "user" creator ON deleted.created_by_id = creator.id;


-- name: DeleteOrphanComponents :exec
DELETE FROM component c
WHERE c.organization_id = sqlc.arg(organization_id)
  AND NOT EXISTS (
    SELECT 1 FROM component_release cr
    WHERE cr.component_id = c.id
  );


-- name: GetOrphanComponentIDs :many
SELECT c.id
FROM component c
WHERE c.organization_id = sqlc.arg(organization_id)
  AND NOT EXISTS (
    SELECT 1 FROM component_release cr
    WHERE cr.component_id = c.id
  );
