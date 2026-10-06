-- name: CreateEntitlementGroup :one
INSERT INTO entitlement_group (name, slug, description, organization_id)
VALUES ($1, $2, $3, sqlc.arg(organization_id))
RETURNING *;


-- name: GetEntitlementGroup :one
SELECT eg.id,
       eg.name,
       eg.slug,
       eg.description,
       eg.organization_id
FROM entitlement_group eg
WHERE eg.organization_id = sqlc.arg(organization_id)
  AND eg.slug = sqlc.arg(slug);


-- name: GetEntitlementGroups :many
-- Cursor (keyset) pagination ordered by id DESC. The entitlement_group table
-- has no created_at/updated_at column, so id (a Postgres gen_random_uuid(),
-- not sequential) is the only available keyset column -- stable total
-- order, not a chronological one. Pass limit_plus_one = requested limit + 1
-- so the caller can detect whether a further page exists without a
-- separate COUNT query. On the first page, pass NULL for cursor_id.
SELECT eg.id,
       eg.name,
       eg.slug,
       eg.description,
       eg.organization_id
FROM entitlement_group eg
WHERE eg.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(cursor_id)::uuid IS NULL
    OR eg.id < sqlc.narg(cursor_id)::uuid
  )
ORDER BY eg.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: UpdateEntitlementGroup :one
UPDATE entitlement_group eg
SET name        = $1,
    description = $2
WHERE eg.slug = sqlc.arg(slug)
  AND eg.organization_id = sqlc.arg(organization_id)
RETURNING eg.*;


-- name: DeleteEntitlementGroup :one
DELETE
FROM entitlement_group eg
WHERE eg.slug = sqlc.arg(slug)
  AND eg.organization_id = sqlc.arg(organization_id)
RETURNING eg.*;


-- name: AddEntitlementToGroup :one
INSERT INTO entitlement_group_membership (entitlement_group_id, entitlement_id, organization_id)
SELECT eg.id, e.id, eg.organization_id
FROM entitlement_group eg
JOIN entitlement e ON e.slug = sqlc.arg(entitlement_slug) AND e.organization_id = eg.organization_id
WHERE eg.slug = sqlc.arg(group_slug)
  AND eg.organization_id = sqlc.arg(organization_id)
RETURNING *;


-- name: RemoveEntitlementFromGroup :exec
DELETE FROM entitlement_group_membership egm
USING entitlement_group eg, entitlement e
WHERE egm.entitlement_group_id = eg.id
  AND egm.entitlement_id = e.id
  AND eg.slug = sqlc.arg(group_slug)
  AND e.slug = sqlc.arg(entitlement_slug)
  AND eg.organization_id = sqlc.arg(organization_id);


-- name: GetEntitlementGroupsForEntitlement :many
SELECT eg.id,
       eg.name,
       eg.slug,
       eg.description,
       eg.organization_id
FROM entitlement_group eg
JOIN entitlement_group_membership egm ON egm.entitlement_group_id = eg.id
JOIN entitlement e ON e.id = egm.entitlement_id
WHERE e.slug = sqlc.arg(entitlement_slug)
  AND eg.organization_id = sqlc.arg(organization_id);


-- name: GetEntitlementGroupsForOrganizationEntitlements :many
-- Fetches all entitlement groups for every entitlement in an organization in one round-trip.
SELECT eg.id,
       eg.name,
       eg.slug,
       eg.description,
       eg.organization_id,
       e.slug AS entitlement_slug
FROM entitlement_group eg
JOIN entitlement_group_membership egm ON egm.entitlement_group_id = eg.id
JOIN entitlement e ON e.id = egm.entitlement_id
WHERE eg.organization_id = sqlc.arg(organization_id)
  AND e.organization_id = sqlc.arg(organization_id);


-- name: GetEntitlementGroupsForLicense :many
-- Fetches all entitlement groups for every entitlement attached to a given license in one
-- round-trip. Use this instead of calling GetEntitlementGroupsForEntitlement N times.
SELECT eg.id,
       eg.name,
       eg.slug,
       eg.description,
       eg.organization_id,
       e.slug AS entitlement_slug
FROM entitlement_group eg
JOIN entitlement_group_membership egm ON egm.entitlement_group_id = eg.id
JOIN entitlement e ON e.id = egm.entitlement_id
JOIN license_entitlement le
  ON le.entitlement_id = e.id
 AND le.organization_id = sqlc.arg(organization_id)
WHERE le.license_id = sqlc.arg(license_id)
  AND eg.organization_id = sqlc.arg(organization_id);


-- name: GetEntitlementGroupUsage :many
-- One row per member of the group; effective_value is NULL for a member the
-- instance is not granted, read through instance_effective_entitlement like
-- every other reader of an instance's entitlement value. now is the same
-- database-time value on every returned row: folded into this query instead
-- of a separate GetDatabaseNow round trip.
SELECT e.id              AS entitlement_id,
       e.slug            AS entitlement_slug,
       e.name            AS entitlement_name,
       e.type            AS entitlement_type,
       e.reset_period,
       e.reset_anchor,
       i.start_license_date,
       eu.value          AS usage_value,
       eu.period_start,
       iee.value         AS effective_value,
       date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
FROM entitlement_group eg
JOIN entitlement_group_membership egm ON egm.entitlement_group_id = eg.id
JOIN entitlement e ON e.id = egm.entitlement_id
JOIN instance i ON i.slug = sqlc.arg(instance_slug) AND i.organization_id = eg.organization_id
LEFT JOIN entitlement_usage eu ON eu.entitlement_id = e.id AND eu.instance_id = i.id AND eu.organization_id = eg.organization_id
LEFT JOIN instance_effective_entitlement iee ON iee.entitlement_id = e.id AND iee.instance_id = i.id
WHERE eg.slug = sqlc.arg(group_slug)
  AND eg.organization_id = sqlc.arg(organization_id);
