-- name: CreateDeploymentZone :one
WITH inserted AS (
  INSERT INTO deployment_zone (name, slug, description, type, metadata, created_at, created_by_id, updated_at, updated_by_id,
                               organization_id)
  SELECT $1,
         $2,
         $3,
         $4,
         $5,
         now(),
         uo.user_id,
         now(),
         uo.user_id,
         uo.organization_id
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
    AND uo.user_id = sqlc.arg(user_id)
    AND uo.deleted_at IS NULL
  RETURNING *
)
SELECT inserted.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name
FROM inserted
  INNER JOIN "user" creator ON inserted.created_by_id = creator.id
  INNER JOIN "user" updater ON inserted.updated_by_id = updater.id;


-- name: GetDeploymentZones :many
-- Unbounded on purpose: also used by metadatafields/dryrunmetadatafield,
-- which must validate a candidate JSON schema against every deployment
-- zone in the organization, not just one page.
-- GetDeploymentZonesByCursor (below) is the cursor-paginated variant for
-- the list-facing caller (REST getdeploymentzones).
SELECT dz.id,
       dz.name,
       dz.slug,
       dz.description,
       dz.type,
       dz.metadata,
       dz.created_by_id,
       creator.name AS created_by_name,
       dz.created_at,
       dz.updated_by_id,
       updater.name AS updated_by_name,
       dz.updated_at,
       dz.organization_id,
       latest_deployment.release_id
FROM deployment_zone dz
  INNER JOIN "user" creator ON dz.created_by_id = creator.id
  INNER JOIN "user" updater ON dz.updated_by_id = updater.id
  LEFT JOIN LATERAL (
    SELECT d.release_id
    FROM deployment d
    WHERE d.deployment_zone_id = dz.id
      AND d.organization_id = dz.organization_id
    ORDER BY d.created_at DESC, d.seq DESC
    LIMIT 1
  ) AS latest_deployment ON TRUE
WHERE dz.organization_id = sqlc.arg(organization_id);


-- name: GetDeploymentZonesByCursor :many
-- Cursor (keyset) pagination: ordered by created_at DESC, id DESC (id
-- tie-breaks created_at, which is not guaranteed unique). Pass
-- limit_plus_one = requested limit + 1 so the caller can detect whether a
-- further page exists without a separate COUNT query. On the first page,
-- pass NULL for both cursor_created_at and cursor_id.
SELECT dz.id,
       dz.name,
       dz.slug,
       dz.description,
       dz.type,
       dz.metadata,
       dz.created_by_id,
       creator.name AS created_by_name,
       dz.created_at,
       dz.updated_by_id,
       updater.name AS updated_by_name,
       dz.updated_at,
       dz.organization_id,
       latest_deployment.release_id
FROM deployment_zone dz
  INNER JOIN "user" creator ON dz.created_by_id = creator.id
  INNER JOIN "user" updater ON dz.updated_by_id = updater.id
  LEFT JOIN LATERAL (
    SELECT d.release_id
    FROM deployment d
    WHERE d.deployment_zone_id = dz.id
      AND d.organization_id = dz.organization_id
    ORDER BY d.created_at DESC, d.seq DESC
    LIMIT 1
  ) AS latest_deployment ON TRUE
WHERE dz.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (dz.created_at, dz.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY dz.created_at DESC, dz.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: GetDeploymentZonesByIDs :many
SELECT dz.id,
       dz.name,
       dz.slug,
       dz.description,
       dz.type,
       dz.metadata,
       dz.created_by_id,
       creator.name AS created_by_name,
       dz.created_at,
       dz.updated_by_id,
       updater.name AS updated_by_name,
       dz.updated_at,
       dz.organization_id,
       latest_deployment.release_id
FROM deployment_zone dz
  INNER JOIN "user" creator ON dz.created_by_id = creator.id
  INNER JOIN "user" updater ON dz.updated_by_id = updater.id
  LEFT JOIN LATERAL (
    SELECT d.release_id
    FROM deployment d
    WHERE d.deployment_zone_id = dz.id
      AND d.organization_id = dz.organization_id
    ORDER BY d.created_at DESC, d.seq DESC
    LIMIT 1
  ) AS latest_deployment ON TRUE
WHERE dz.organization_id = sqlc.arg(organization_id)
  AND dz.id = ANY (sqlc.arg(deployment_zone_ids)::uuid[]);


-- name: GetDeploymentZonesByReleaseIDs :many
SELECT DISTINCT ON (d.release_id, dz.id)
       d.release_id,
       dz.id,
       dz.name,
       dz.slug,
       dz.description,
       dz.type,
       dz.metadata,
       dz.created_by_id,
       creator.name AS created_by_name,
       dz.created_at,
       dz.updated_by_id,
       updater.name AS updated_by_name,
       dz.updated_at,
       dz.organization_id,
       current_deployment.release_id AS current_release_id
FROM deployment d
  INNER JOIN deployment_zone dz ON dz.id = d.deployment_zone_id
  INNER JOIN "user" creator ON dz.created_by_id = creator.id
  INNER JOIN "user" updater ON dz.updated_by_id = updater.id
  LEFT JOIN LATERAL (
    SELECT latest.release_id
    FROM deployment latest
    WHERE latest.organization_id = d.organization_id
      AND latest.deployment_zone_id = dz.id
    ORDER BY latest.created_at DESC, latest.seq DESC
    LIMIT 1
  ) AS current_deployment ON TRUE
WHERE d.organization_id = sqlc.arg(organization_id)
  AND d.release_id = ANY (sqlc.arg(release_ids)::uuid[])
ORDER BY d.release_id, dz.id, d.created_at DESC;


-- name: GetOneDeploymentZone :one
SELECT dz.id,
       dz.name,
       dz.slug,
       dz.description,
       dz.type,
       dz.metadata,
       dz.created_by_id,
       creator.name AS created_by_name,
       dz.created_at,
       dz.updated_by_id,
       updater.name AS updated_by_name,
       dz.updated_at,
       dz.organization_id,
       latest_deployment.release_id
FROM deployment_zone dz
  INNER JOIN "user" creator ON dz.created_by_id = creator.id
  INNER JOIN "user" updater ON dz.updated_by_id = updater.id
  LEFT JOIN LATERAL (
    SELECT d.release_id
    FROM deployment d
    WHERE d.deployment_zone_id = dz.id
      AND d.organization_id = dz.organization_id
    ORDER BY d.created_at DESC, d.seq DESC
    LIMIT 1
  ) AS latest_deployment ON TRUE
WHERE dz.organization_id = sqlc.arg(organization_id)
  AND dz.id = sqlc.arg(deployment_zone_id);


-- name: GetOneDeploymentZoneBySlug :one
SELECT dz.id,
       dz.name,
       dz.slug,
       dz.description,
       dz.type,
       dz.metadata,
       dz.created_by_id,
       creator.name AS created_by_name,
       dz.created_at,
       dz.updated_by_id,
       updater.name AS updated_by_name,
       dz.updated_at,
       dz.organization_id,
       latest_deployment.release_id
FROM deployment_zone dz
  INNER JOIN "user" creator ON dz.created_by_id = creator.id
  INNER JOIN "user" updater ON dz.updated_by_id = updater.id
  LEFT JOIN LATERAL (
    SELECT d.release_id
    FROM deployment d
    WHERE d.deployment_zone_id = dz.id
      AND d.organization_id = dz.organization_id
    ORDER BY d.created_at DESC, d.seq DESC
    LIMIT 1
  ) AS latest_deployment ON TRUE
WHERE dz.organization_id = sqlc.arg(organization_id)
  AND dz.slug = sqlc.arg(slug);


-- name: UpdateDeploymentZone :one
WITH updated AS (
  UPDATE deployment_zone dz
  SET name = $1,
      description = $2,
      type = $3,
      metadata = $4,
      updated_by_id = uo.user_id,
      updated_at = now()
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
    AND uo.user_id = sqlc.arg(user_id)
    AND uo.deleted_at IS NULL
    AND dz.organization_id = uo.organization_id
    AND dz.id = sqlc.arg(deployment_zone_id)
  RETURNING dz.*
)
SELECT updated.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name
FROM updated
  INNER JOIN "user" creator ON updated.created_by_id = creator.id
  INNER JOIN "user" updater ON updated.updated_by_id = updater.id;


-- name: UpdateDeploymentZoneBySlug :one
WITH updated AS (
  UPDATE deployment_zone dz
  SET name = $1,
      description = $2,
      type = $3,
      metadata = $4,
      updated_by_id = uo.user_id,
      updated_at = now()
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
    AND uo.user_id = sqlc.arg(user_id)
    AND uo.deleted_at IS NULL
    AND dz.organization_id = uo.organization_id
    AND dz.slug = sqlc.arg(slug)
  RETURNING dz.*
)
SELECT updated.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name
FROM updated
  INNER JOIN "user" creator ON updated.created_by_id = creator.id
  INNER JOIN "user" updater ON updated.updated_by_id = updater.id;


-- name: DeleteDeploymentZone :one
WITH deleted AS (
  DELETE FROM deployment_zone dz
  WHERE dz.id = sqlc.arg(deployment_zone_id)
    AND dz.organization_id = sqlc.arg(organization_id)
  RETURNING dz.*
)
SELECT deleted.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name
FROM deleted
  INNER JOIN "user" creator ON deleted.created_by_id = creator.id
  INNER JOIN "user" updater ON deleted.updated_by_id = updater.id;


-- name: DeleteDeploymentZoneBySlug :one
WITH deleted AS (
  DELETE FROM deployment_zone dz
  WHERE dz.slug = sqlc.arg(slug)
    AND dz.organization_id = sqlc.arg(organization_id)
  RETURNING dz.*
)
SELECT deleted.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name
FROM deleted
  INNER JOIN "user" creator ON deleted.created_by_id = creator.id
  INNER JOIN "user" updater ON deleted.updated_by_id = updater.id;
