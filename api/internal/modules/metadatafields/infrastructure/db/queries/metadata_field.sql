-- name: InsertMetadataField :one
INSERT INTO metadata_field (
  organization_id,
  resource_type,
  key,
  label,
  json_schema,
  display_order,
  created_at,
  created_by_id,
  updated_at,
  updated_by_id
) VALUES (
  sqlc.arg(organization_id),
  sqlc.arg(resource_type),
  sqlc.arg(key),
  sqlc.arg(label),
  sqlc.arg(json_schema),
  sqlc.arg(display_order),
  now(),
  sqlc.arg(user_id),
  now(),
  sqlc.arg(user_id)
)
RETURNING *;


-- name: ListMetadataFieldsByResourceType :many
-- Cursor (keyset) pagination on a user-reorderable list: display_order is
-- the primary, admin-controlled sort key (not unique -- multiple fields
-- can share a display_order, e.g. before the first manual reorder), so
-- created_at and then id (always unique) tie-break it, extending the
-- table's natural display_order ASC, created_at ASC order with a third
-- key for a fully deterministic keyset. Pass limit_plus_one = requested
-- limit + 1 so the caller can detect whether a further page exists
-- without a separate COUNT query. On the first page, pass NULL for
-- cursor_display_order (and, by convention, the other two cursor
-- columns).
SELECT *
FROM metadata_field
WHERE organization_id = sqlc.arg(organization_id)
  AND resource_type = sqlc.arg(resource_type)
  AND archived_at IS NULL
  AND (
    sqlc.narg(cursor_display_order)::int IS NULL
    OR (display_order, created_at, id) > (
      sqlc.narg(cursor_display_order)::int,
      sqlc.narg(cursor_created_at)::timestamp,
      sqlc.narg(cursor_id)::uuid
    )
  )
ORDER BY display_order ASC, created_at ASC, id ASC
LIMIT sqlc.arg(limit_plus_one);


-- name: ListMetadataFieldsByResourceTypeIncludingArchived :many
-- Used by the validator: archived fields are still relevant because previously
-- stored metadata keys must keep passing validation as raw jsonb (the
-- "fallback raw JSON" semantics).
SELECT *
FROM metadata_field
WHERE organization_id = sqlc.arg(organization_id)
  AND resource_type = sqlc.arg(resource_type)
ORDER BY display_order ASC, created_at ASC;


-- name: ListMetadataFieldsForGraphQL :many
-- Variant for the GraphQL surface: joins the user table so the
-- MetadataField.createdBy / updatedBy fields can expose a name, not just an
-- ID. The `include_archived` flag mirrors the GraphQL query argument: false
-- (default) hides soft-deleted rows, true returns everything.
--
-- Keyset-paginated on the same (display_order, created_at, id) triple as
-- ListMetadataFieldsByResourceType above, so a cursor minted by one surface
-- decodes and resumes correctly on the other. The two queries differ only in
-- their projection (this one joins user names) and in the archived rows
-- include_archived lets through -- never in their order.
SELECT mf.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name
FROM metadata_field mf
JOIN "user" creator ON creator.id = mf.created_by_id
JOIN "user" updater ON updater.id = mf.updated_by_id
WHERE mf.organization_id = sqlc.arg(organization_id)
  AND mf.resource_type = sqlc.arg(resource_type)
  AND (sqlc.arg(include_archived)::boolean OR mf.archived_at IS NULL)
  AND (
    sqlc.narg(cursor_display_order)::int IS NULL
    OR (mf.display_order, mf.created_at, mf.id) > (
      sqlc.narg(cursor_display_order)::int,
      sqlc.narg(cursor_created_at)::timestamp,
      sqlc.narg(cursor_id)::uuid
    )
  )
ORDER BY mf.display_order ASC, mf.created_at ASC, mf.id ASC
LIMIT sqlc.arg(limit_plus_one);


-- name: GetMetadataField :one
SELECT *
FROM metadata_field
WHERE id = sqlc.arg(id)
  AND organization_id = sqlc.arg(organization_id);


-- name: UpdateMetadataField :one
-- Only label + json_schema are mutable through PATCH. display_order is
-- exclusively driven by the dedicated /reorder endpoint to avoid a stale
-- snapshot from a long-running edit form silently rewinding the ordering.
UPDATE metadata_field
SET label = sqlc.arg(label),
    json_schema = sqlc.arg(json_schema),
    updated_at = now(),
    updated_by_id = sqlc.arg(user_id)
WHERE id = sqlc.arg(id)
  AND organization_id = sqlc.arg(organization_id)
  AND archived_at IS NULL
RETURNING *;


-- name: ArchiveMetadataField :one
UPDATE metadata_field
SET archived_at = now(),
    updated_at = now(),
    updated_by_id = sqlc.arg(user_id)
WHERE id = sqlc.arg(id)
  AND organization_id = sqlc.arg(organization_id)
  AND archived_at IS NULL
RETURNING *;


-- name: UnarchiveMetadataField :one
-- Symmetric to ArchiveMetadataField: clears archived_at so the field re-enters
-- the active schema composition. The partial unique index
-- uq_metadata_field_key_active (WHERE archived_at IS NULL) means this UPDATE
-- raises a unique violation if an active field already uses the same
-- (organization, resource_type, key) — the repository maps that to a 409.
-- The `archived_at IS NOT NULL` guard makes "field not archived / not found"
-- collapse into pgx.ErrNoRows → 404.
UPDATE metadata_field
SET archived_at = NULL,
    updated_at = now(),
    updated_by_id = sqlc.arg(user_id)
WHERE id = sqlc.arg(id)
  AND organization_id = sqlc.arg(organization_id)
  AND archived_at IS NOT NULL
RETURNING *;


-- name: ListActiveMetadataFieldsByIDs :many
SELECT *
FROM metadata_field
WHERE organization_id = sqlc.arg(organization_id)
  AND id = ANY(sqlc.arg(ids)::uuid[])
  AND archived_at IS NULL;


-- name: ReorderMetadataField :execrows
UPDATE metadata_field
SET display_order = sqlc.arg(display_order),
    updated_at = now(),
    updated_by_id = sqlc.arg(user_id)
WHERE id = sqlc.arg(id)
  AND organization_id = sqlc.arg(organization_id)
  AND archived_at IS NULL;
