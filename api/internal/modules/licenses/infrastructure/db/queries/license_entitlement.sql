-- name: GetEntitlementsForLicense :many
-- Unbounded on purpose: also used by the GraphQL License.entitlements
-- dataloader, which is a per-license nested field (not a top-level list
-- endpoint) and needs every entitlement grant for that one license.
-- GetEntitlementsForLicenseByCursor (below) is the cursor-paginated
-- variant for the list-facing caller (REST getlicenseentitlements).
SELECT le.id,
       le.entitlement_id,
       le.license_id,
       le.created_by_id,
       creator.name AS created_by_name,
       le.created_at,
       le.updated_by_id,
       updater.name AS updated_by_name,
       le.updated_at,
       le.value,
       le.limit_cap_exceeded_overage_percent,
       le.organization_id,
       e.name as entitlement_name,
       e.type as entitlement_type,
       e.slug as entitlement_slug
FROM license_entitlement le
       JOIN entitlement e ON le.entitlement_id = e.id
       INNER JOIN "user" creator ON le.created_by_id = creator.id
       INNER JOIN "user" updater ON le.updated_by_id = updater.id
WHERE le.organization_id = sqlc.arg(organization_id)
  AND le.license_id = sqlc.arg(license_id);


-- name: GetEntitlementsForLicenseByCursor :many
-- Cursor (keyset) pagination: ordered by created_at DESC, id DESC (id
-- tie-breaks created_at, which is not guaranteed unique). id here is
-- license_entitlement.id, an internal join-row identifier not exposed on
-- the LicenseEntitlement API schema (which has no single-field natural
-- key), used purely as a stable cursor tie-breaker. Pass limit_plus_one =
-- requested limit + 1 so the caller can detect whether a further page
-- exists without a separate COUNT query. On the first page, pass NULL for
-- both cursor_created_at and cursor_id.
SELECT le.id,
       le.entitlement_id,
       le.license_id,
       le.created_by_id,
       creator.name AS created_by_name,
       le.created_at,
       le.updated_by_id,
       updater.name AS updated_by_name,
       le.updated_at,
       le.value,
       le.limit_cap_exceeded_overage_percent,
       le.organization_id,
       e.name as entitlement_name,
       e.type as entitlement_type,
       e.slug as entitlement_slug
FROM license_entitlement le
       JOIN entitlement e ON le.entitlement_id = e.id
       INNER JOIN "user" creator ON le.created_by_id = creator.id
       INNER JOIN "user" updater ON le.updated_by_id = updater.id
WHERE le.organization_id = sqlc.arg(organization_id)
  AND le.license_id = sqlc.arg(license_id)
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (le.created_at, le.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY le.created_at DESC, le.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: AssociateEntitlementToLicense :one

-- name: AssociateEntitlementToLicenseBySlugs :one
WITH inserted AS (
  INSERT INTO license_entitlement (
      entitlement_id,
      license_id,
      created_by_id,
      created_at,
      updated_by_id,
      updated_at,
      value,
      limit_cap_exceeded_overage_percent,
      organization_id
  )
  SELECT
         e.id,
         l.id,
         uo.user_id,
         NOW(),
         uo.user_id,
         NOW(),
         sqlc.arg(value),
         sqlc.arg(limit_cap_exceeded_overage_percent),
         uo.organization_id
  FROM user_on_organization uo
  JOIN license l
    ON l.organization_id = uo.organization_id
   AND l.slug = sqlc.arg(license_slug)
  JOIN entitlement e
    ON e.organization_id = uo.organization_id
   AND e.slug = sqlc.arg(entitlement_slug)
  WHERE uo.organization_id = sqlc.arg(organization_id)
    AND uo.user_id = sqlc.arg(user_id)
    AND uo.deleted_at IS NULL
  RETURNING *
)
SELECT
  inserted.id,
  inserted.entitlement_id,
  inserted.license_id,
  inserted.created_by_id,
  creator.name AS created_by_name,
  inserted.created_at,
  inserted.updated_by_id,
  updater.name AS updated_by_name,
  inserted.updated_at,
  inserted.value,
  inserted.limit_cap_exceeded_overage_percent,
  inserted.organization_id,
  e.name  AS entitlement_name,
  e.type  AS entitlement_type,
  e.slug  AS entitlement_slug,
  l.slug  AS license_slug
FROM inserted
  INNER JOIN "user" creator ON inserted.created_by_id = creator.id
  INNER JOIN "user" updater ON inserted.updated_by_id = updater.id
  INNER JOIN entitlement e ON e.id = inserted.entitlement_id
  INNER JOIN license l ON l.id = inserted.license_id;


-- name: GetEntitlementForLicense :one
SELECT
       le.id,
       le.entitlement_id,
       le.license_id,
       le.created_by_id,
       creator.name AS created_by_name,
       le.created_at,
       le.updated_by_id,
       updater.name AS updated_by_name,
       le.updated_at,
       le.value,
       le.limit_cap_exceeded_overage_percent,
       le.organization_id,
       e.name  AS entitlement_name,
       e.type  AS entitlement_type,
       e.slug  AS entitlement_slug,
       l.slug  AS license_slug
FROM license_entitlement le
JOIN license l
  ON l.id = le.license_id
 AND l.organization_id = le.organization_id
JOIN entitlement e
  ON e.id = le.entitlement_id
 AND e.organization_id = le.organization_id
INNER JOIN "user" creator ON le.created_by_id = creator.id
INNER JOIN "user" updater ON le.updated_by_id = updater.id
WHERE le.organization_id = sqlc.arg(organization_id)
  AND l.slug = sqlc.arg(license_slug)
  AND e.slug = sqlc.arg(entitlement_slug);

-- name: UpdateEntitlementForLicense :one
WITH updated AS (
  UPDATE license_entitlement le
  SET value         = sqlc.arg(value),
      limit_cap_exceeded_overage_percent = sqlc.arg(limit_cap_exceeded_overage_percent),
      updated_by_id = uo.user_id,
      updated_at    = NOW()
  FROM user_on_organization uo,
       license l,
       entitlement e
  WHERE le.organization_id = sqlc.arg(organization_id)

    -- Resolve license by slug (scoped to org)
    AND l.organization_id = le.organization_id
    AND l.slug = sqlc.arg(license_slug)
    AND le.license_id = l.id

    -- Resolve entitlement by slug (scoped to org)
    AND e.organization_id = le.organization_id
    AND e.slug = sqlc.arg(entitlement_slug)
    AND le.entitlement_id = e.id

    -- Validate updater belongs to organization
    AND uo.organization_id = le.organization_id
    AND uo.user_id = sqlc.arg(user_id)
    AND uo.deleted_at IS NULL

  RETURNING le.*
)
SELECT
  updated.id,
  updated.entitlement_id,
  updated.license_id,
  updated.created_by_id,
  creator.name AS created_by_name,
  updated.created_at,
  updated.updated_by_id,
  updater.name AS updated_by_name,
  updated.updated_at,
  updated.value,
  updated.limit_cap_exceeded_overage_percent,
  updated.organization_id,
  e.name  AS entitlement_name,
  e.type  AS entitlement_type,
  e.slug  AS entitlement_slug,
  l.slug  AS license_slug
FROM updated
  INNER JOIN "user" creator ON updated.created_by_id = creator.id
  INNER JOIN "user" updater ON updated.updated_by_id = updater.id
  INNER JOIN entitlement e ON e.id = updated.entitlement_id
  INNER JOIN license l ON l.id = updated.license_id;


-- name: RemoveEntitlementFromLicense :one
WITH deleted AS (
  DELETE FROM license_entitlement le
  USING license l,
        entitlement e
  WHERE le.organization_id = sqlc.arg(organization_id)

    -- Resolve license by slug (scoped to org)
    AND l.organization_id = le.organization_id
    AND l.slug = sqlc.arg(license_slug)
    AND le.license_id = l.id

    -- Resolve entitlement by slug (scoped to org)
    AND e.organization_id = le.organization_id
    AND e.slug = sqlc.arg(entitlement_slug)
    AND le.entitlement_id = e.id

  RETURNING le.*
)
SELECT
  deleted.id,
  deleted.entitlement_id,
  deleted.license_id,
  deleted.created_by_id,
  creator.name AS created_by_name,
  deleted.created_at,
  deleted.updated_by_id,
  updater.name AS updated_by_name,
  deleted.updated_at,
  deleted.value,
  deleted.limit_cap_exceeded_overage_percent,
  deleted.organization_id,
  e.name  AS entitlement_name,
  e.type  AS entitlement_type,
  e.slug  AS entitlement_slug,
  l.slug  AS license_slug
FROM deleted
  INNER JOIN "user" creator ON deleted.created_by_id = creator.id
  INNER JOIN "user" updater ON deleted.updated_by_id = updater.id
  INNER JOIN entitlement e ON e.id = deleted.entitlement_id
  INNER JOIN license l ON l.id = deleted.license_id;
