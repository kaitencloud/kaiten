-- name: CreateDeployment :one
-- Append-only: every deployment of a release to a zone is its own row, so
-- re-deploying a release a zone already ran (a rollback) records a new event
-- instead of colliding with the old one.
WITH inserted AS (
  INSERT INTO deployment (deployment_zone_id, release_id, created_by_id, organization_id)
  SELECT $1, $2, uo.user_id, uo.organization_id
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
         AND uo.user_id = sqlc.arg(user_id)
         AND uo.deleted_at IS NULL
  RETURNING *
)
SELECT inserted.id, inserted.deployment_zone_id, inserted.release_id, inserted.created_by_id,
       creator.name AS created_by_name,
       inserted.created_at, inserted.organization_id
FROM inserted
  INNER JOIN "user" creator ON inserted.created_by_id = creator.id;


-- name: GetDeployments :many
-- The zone's deployment history, newest first.
SELECT d.id, d.deployment_zone_id, d.release_id, d.created_by_id,
       creator.name AS created_by_name,
       d.created_at, d.organization_id
FROM deployment d
  INNER JOIN "user" creator ON d.created_by_id = creator.id
WHERE d.organization_id = sqlc.arg(organization_id)
  AND d.deployment_zone_id = sqlc.arg(deployment_zone_id)
ORDER BY d.created_at DESC, d.seq DESC;


-- name: GetDeploymentsByReleaseIDs :many
-- Every deployment of each release, newest first: a release deployed twice to
-- the same zone (rolled back to) appears once per deployment.
SELECT d.id,
       d.deployment_zone_id,
       d.release_id,
       d.created_by_id,
       creator.name AS created_by_name,
       d.created_at,
       d.organization_id
FROM deployment d
  INNER JOIN "user" creator ON d.created_by_id = creator.id
WHERE d.organization_id = sqlc.arg(organization_id)
  AND d.release_id = ANY (sqlc.arg(release_ids)::uuid[])
ORDER BY d.release_id, d.created_at DESC, d.seq DESC;
