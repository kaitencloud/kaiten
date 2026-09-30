-- name: GetAllInstances :many
-- Unbounded on purpose: used by metadatafields/dryrunmetadatafield, which
-- must validate a candidate JSON schema against every instance in the
-- organization, not just one page. GetAllInstancesByCursor (below) is the
-- cursor-paginated variant for list-facing callers (REST getinstances,
-- GraphQL Query.instances).
SELECT i.id, i.created_by_id, creator.name AS created_by_name, i.created_at,
       i.updated_by_id, updater.name AS updated_by_name, i.updated_at, i.status, i.lifecycle_stage, i.name, i.slug, i.description,
       i.customer_id,
       c.slug AS customer_slug,
       i.license_id,
       l.slug AS license_slug,
       i.deployment_zone_id,
       dz.slug AS deployment_zone_slug,
       i.start_license_date,
       i.end_license_date,
       i.metadata,
       i.organization_id
FROM instance i
  INNER JOIN "user" creator ON i.created_by_id = creator.id
  INNER JOIN "user" updater ON i.updated_by_id = updater.id
  LEFT JOIN "license" l ON i.license_id = l.id
  LEFT JOIN "customer" c ON i.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON i.deployment_zone_id = dz.id
WHERE i.organization_id = sqlc.arg(organization_id);


-- name: GetAllInstancesByCursor :many
-- Cursor (keyset) pagination: ordered by created_at DESC, id DESC (id
-- tie-breaks created_at, which is not guaranteed unique). Pass
-- limit_plus_one = requested limit + 1 so the caller can detect whether a
-- further page exists without a separate COUNT query. On the first page,
-- pass NULL for both cursor_created_at and cursor_id. Pass NULL for
-- adapter to page over every instance, or an adapter name to keep only
-- the instances synced with that integration (a matching
-- instance_integrations row with a non-empty external_id).
SELECT i.id, i.created_by_id, creator.name AS created_by_name, i.created_at,
       i.updated_by_id, updater.name AS updated_by_name, i.updated_at, i.status, i.lifecycle_stage, i.name, i.slug, i.description,
       i.customer_id,
       c.slug AS customer_slug,
       i.license_id,
       l.slug AS license_slug,
       i.deployment_zone_id,
       dz.slug AS deployment_zone_slug,
       i.start_license_date,
       i.end_license_date,
       i.metadata,
       i.organization_id
FROM instance i
  INNER JOIN "user" creator ON i.created_by_id = creator.id
  INNER JOIN "user" updater ON i.updated_by_id = updater.id
  LEFT JOIN "license" l ON i.license_id = l.id
  LEFT JOIN "customer" c ON i.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON i.deployment_zone_id = dz.id
WHERE i.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(adapter)::text IS NULL
    OR EXISTS (
      SELECT 1
      FROM instance_integrations ii
      WHERE ii.instance_id = i.id
        AND ii.organization_id = i.organization_id
        AND ii.adapter = sqlc.narg(adapter)::text
        AND ii.external_id <> ''
    )
  )
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (i.created_at, i.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY i.created_at DESC, i.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: CreateInstance :one
WITH inserted AS (
  INSERT INTO instance (created_by_id, updated_by_id, name, slug, description, customer_id, license_id,
                        deployment_zone_id, start_license_date, end_license_date, metadata, organization_id)
  SELECT uo.user_id,
         uo.user_id,
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         $8,
         sqlc.arg(metadata)::jsonb,
         uo.organization_id
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
    AND uo.user_id = sqlc.arg(user_id)
    AND uo.deleted_at IS NULL
  RETURNING *
)
SELECT inserted.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name,
       l.slug AS license_slug,
       c.slug AS customer_slug,
       dz.slug AS deployment_zone_slug
FROM inserted
  INNER JOIN "user" creator ON inserted.created_by_id = creator.id
  INNER JOIN "user" updater ON inserted.updated_by_id = updater.id
  LEFT JOIN "license" l ON inserted.license_id = l.id
  LEFT JOIN "customer" c ON inserted.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON inserted.deployment_zone_id = dz.id;


-- name: GetOneInstance :one
SELECT i.id, i.created_by_id, creator.name AS created_by_name, i.created_at,
       i.updated_by_id, updater.name AS updated_by_name, i.updated_at, i.status, i.lifecycle_stage, i.name, i.slug, i.description,
       i.customer_id,
       c.slug AS customer_slug,
       i.license_id,
       l.slug AS license_slug,
       i.deployment_zone_id,
       dz.slug AS deployment_zone_slug,
       i.start_license_date,
       i.end_license_date,
       i.metadata,
       i.organization_id
FROM instance i
  INNER JOIN "user" creator ON i.created_by_id = creator.id
  INNER JOIN "user" updater ON i.updated_by_id = updater.id
  LEFT JOIN "license" l ON i.license_id = l.id
  LEFT JOIN "customer" c ON i.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON i.deployment_zone_id = dz.id
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.slug = sqlc.arg(slug);


-- name: EditInstance :one
-- new_slug is the one optional column: NULL keeps the row's current slug, so
-- a client that does not model the slug at all -- every caller written
-- before renaming was possible -- sends the body it always sent and nothing
-- moves. It is the same keep-if-absent shape UpdateComponent uses. The slug
-- in the WHERE clause is a different thing: it ADDRESSES the instance and is
-- matched against the pre-update row, so a rename reads by the old slug and
-- returns the new one.
WITH updated AS (
  UPDATE instance i
  SET updated_by_id = uo.user_id,
      updated_at = now(),
      name = $1,
      description = $2,
      customer_id = $3,
      license_id = $4,
      deployment_zone_id = $5,
      start_license_date = $6,
      end_license_date = $7,
      metadata = sqlc.arg(metadata)::jsonb,
      slug = COALESCE(sqlc.narg(new_slug), i.slug)
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
         AND uo.user_id = sqlc.arg(user_id)
         AND uo.deleted_at IS NULL
         AND i.organization_id = uo.organization_id
         AND i.slug = sqlc.arg(slug)
  RETURNING i.*
)
SELECT updated.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name,
       l.slug AS license_slug,
       c.slug AS customer_slug,
       dz.slug AS deployment_zone_slug
FROM updated
  INNER JOIN "user" creator ON updated.created_by_id = creator.id
  INNER JOIN "user" updater ON updated.updated_by_id = updater.id
  LEFT JOIN "license" l ON updated.license_id = l.id
  LEFT JOIN "customer" c ON updated.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON updated.deployment_zone_id = dz.id;


-- name: UpdateInstanceStatus :one
WITH updated AS (
  UPDATE instance i
  SET updated_by_id = uo.user_id,
      updated_at = now(),
      status = sqlc.arg(status)::instance_status
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
         AND uo.user_id = sqlc.arg(user_id)
         AND uo.deleted_at IS NULL
         AND i.organization_id = uo.organization_id
         AND i.slug = sqlc.arg(slug)
  RETURNING i.*
)
SELECT updated.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name,
       l.slug AS license_slug,
       c.slug AS customer_slug,
       dz.slug AS deployment_zone_slug
FROM updated
  INNER JOIN "user" creator ON updated.created_by_id = creator.id
  INNER JOIN "user" updater ON updated.updated_by_id = updater.id
  LEFT JOIN "license" l ON updated.license_id = l.id
  LEFT JOIN "customer" c ON updated.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON updated.deployment_zone_id = dz.id;


-- name: UpdateInstanceLifecycleStage :one
WITH updated AS (
  UPDATE instance i
  SET updated_by_id = uo.user_id,
      updated_at = now(),
      lifecycle_stage = sqlc.arg(lifecycle_stage)
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
         AND uo.user_id = sqlc.arg(user_id)
         AND uo.deleted_at IS NULL
         AND i.organization_id = uo.organization_id
         AND i.slug = sqlc.arg(slug)
  RETURNING i.*
)
SELECT updated.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name,
       l.slug AS license_slug,
       c.slug AS customer_slug,
       dz.slug AS deployment_zone_slug
FROM updated
  INNER JOIN "user" creator ON updated.created_by_id = creator.id
  INNER JOIN "user" updater ON updated.updated_by_id = updater.id
  LEFT JOIN "license" l ON updated.license_id = l.id
  LEFT JOIN "customer" c ON updated.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON updated.deployment_zone_id = dz.id;


-- name: DeleteInstance :one
-- Real, hard delete: the instance row and everything FK-cascaded from it
-- (entitlement_usage, instance_integrations, feature_audit_trail's
-- successor audit_trail via ON DELETE SET NULL) are gone for good and not
-- recoverable -- the frontend guards this behind an explicit confirmation
-- dialog because of exactly this (see instance-table-actions.tsx). There
-- is no soft-delete counterpart: instance has no deleted_at column, so
-- there is no trash to restore from and no include-deleted read.
WITH deleted AS (
  DELETE FROM instance i
  USING user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
         AND uo.user_id = sqlc.arg(user_id)
         AND uo.deleted_at IS NULL
         AND i.organization_id = uo.organization_id
         AND i.slug = sqlc.arg(slug)
  RETURNING i.*
)
SELECT deleted.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name,
       l.slug AS license_slug,
       c.slug AS customer_slug,
       dz.slug AS deployment_zone_slug
FROM deleted
  INNER JOIN "user" creator ON deleted.created_by_id = creator.id
  INNER JOIN "user" updater ON deleted.updated_by_id = updater.id
  LEFT JOIN "license" l ON deleted.license_id = l.id
  LEFT JOIN "customer" c ON deleted.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON deleted.deployment_zone_id = dz.id;


-- name: InstanceExists :one
SELECT EXISTS (
  SELECT 1
  FROM instance i
  WHERE i.id = sqlc.arg(instance_id)
              AND i.organization_id = sqlc.arg(organization_id)
);


-- name: GetInstancesByIDs :many
SELECT i.id,
       i.created_by_id,
       creator.name AS created_by_name,
       i.created_at,
       i.updated_by_id,
       updater.name AS updated_by_name,
       i.updated_at,
       i.status,
       i.lifecycle_stage,
       i.name,
       i.slug,
       i.description,
       i.customer_id,
       c.slug AS customer_slug,
       i.license_id,
       l.slug AS license_slug,
       i.deployment_zone_id,
       dz.slug AS deployment_zone_slug,
       i.start_license_date,
       i.end_license_date,
       i.metadata,
       i.organization_id
FROM instance i
  INNER JOIN "user" creator ON i.created_by_id = creator.id
  INNER JOIN "user" updater ON i.updated_by_id = updater.id
  LEFT JOIN "license" l ON i.license_id = l.id
  LEFT JOIN "customer" c ON i.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON i.deployment_zone_id = dz.id
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.id = ANY (sqlc.arg(instance_ids)::uuid[]);


-- name: GetInstancesByCustomerIDs :many
SELECT i.id,
       i.created_by_id,
       creator.name AS created_by_name,
       i.created_at,
       i.updated_by_id,
       updater.name AS updated_by_name,
       i.updated_at,
       i.status,
       i.lifecycle_stage,
       i.name,
       i.slug,
       i.description,
       i.customer_id,
       c.slug AS customer_slug,
       i.license_id,
       l.slug AS license_slug,
       i.deployment_zone_id,
       dz.slug AS deployment_zone_slug,
       i.start_license_date,
       i.end_license_date,
       i.metadata,
       i.organization_id
FROM instance i
  INNER JOIN "user" creator ON i.created_by_id = creator.id
  INNER JOIN "user" updater ON i.updated_by_id = updater.id
  LEFT JOIN "license" l ON i.license_id = l.id
  LEFT JOIN "customer" c ON i.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON i.deployment_zone_id = dz.id
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.customer_id = ANY (sqlc.arg(customer_ids)::uuid[])
-- Deterministic order: snapshot clients pick "the customer's first instance"
-- as the default portal target, which must not flip between refreshes.
ORDER BY i.created_at, i.id;


-- name: GetInstancesByLicenseIDs :many
SELECT i.id,
       i.created_by_id,
       creator.name AS created_by_name,
       i.created_at,
       i.updated_by_id,
       updater.name AS updated_by_name,
       i.updated_at,
       i.status,
       i.lifecycle_stage,
       i.name,
       i.slug,
       i.description,
       i.customer_id,
       c.slug AS customer_slug,
       i.license_id,
       l.slug AS license_slug,
       i.deployment_zone_id,
       dz.slug AS deployment_zone_slug,
       i.start_license_date,
       i.end_license_date,
       i.metadata,
       i.organization_id
FROM instance i
  INNER JOIN "user" creator ON i.created_by_id = creator.id
  INNER JOIN "user" updater ON i.updated_by_id = updater.id
  LEFT JOIN "license" l ON i.license_id = l.id
  LEFT JOIN "customer" c ON i.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON i.deployment_zone_id = dz.id
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.license_id = ANY (sqlc.arg(license_ids)::uuid[]);


-- name: GetInstancesByReleaseIDs :many
SELECT DISTINCT ON (d.release_id, i.id)
       d.release_id,
       i.id,
       i.created_by_id,
       creator.name AS created_by_name,
       i.created_at,
       i.updated_by_id,
       updater.name AS updated_by_name,
       i.updated_at,
       i.status,
       i.lifecycle_stage,
       i.name,
       i.slug,
       i.description,
       i.customer_id,
       c.slug AS customer_slug,
       i.license_id,
       l.slug AS license_slug,
       i.deployment_zone_id,
       dz.slug AS deployment_zone_slug,
       i.start_license_date,
       i.end_license_date,
       i.metadata,
       i.organization_id
FROM deployment d
  INNER JOIN instance i ON i.deployment_zone_id = d.deployment_zone_id
  INNER JOIN "user" creator ON i.created_by_id = creator.id
  INNER JOIN "user" updater ON i.updated_by_id = updater.id
  LEFT JOIN "license" l ON i.license_id = l.id
  LEFT JOIN "customer" c ON i.customer_id = c.id
  LEFT JOIN "deployment_zone" dz ON i.deployment_zone_id = dz.id
WHERE d.organization_id = sqlc.arg(organization_id)
  AND d.release_id = ANY (sqlc.arg(release_ids)::uuid[])
ORDER BY d.release_id, i.id, d.created_at DESC;
