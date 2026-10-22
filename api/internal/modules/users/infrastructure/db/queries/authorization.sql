-- name: LockUserAuthorizationOrganization :one
-- All management writes and JIT bootstrap use this same transaction-held lock.
-- Count/check and replacement MUST be separate statements after this lock, so
-- READ COMMITTED refreshes its snapshot after a waiting writer commits.
SELECT id FROM organization
WHERE id = sqlc.arg(organization_id)
FOR NO KEY UPDATE;

-- name: BootstrapUserAdministrator :one
-- Called after EnsureMembership succeeds, inside EnsureUser's transaction.
-- A conflicting claimant waits for commit/rollback: only the winning successful
-- transaction gets a row from claimed, and a rollback consumes nothing.
WITH claimed AS (
  INSERT INTO user_administrator_bootstrap (singleton, user_id, organization_id)
  SELECT TRUE, u.id, o.id
  FROM "user" u
  JOIN user_on_organization m ON m.user_id = u.id AND m.deleted_at IS NULL
  JOIN organization o ON o.id = m.organization_id
  LEFT JOIN user_organization_authorization a
    ON a.organization_id = m.organization_id AND a.user_id = u.id
  WHERE COALESCE(a.enabled, TRUE)
    AND u.id = sqlc.arg(user_id)
    AND o.id = sqlc.arg(organization_id)
    AND u.deleted_at IS NULL AND u.type = 'human'
    AND u.external_id NOT LIKE 'system:%'
  ON CONFLICT (singleton) DO NOTHING
  RETURNING user_id, organization_id
), granted AS (
  INSERT INTO user_organization_authorization (organization_id, user_id, roles)
  SELECT organization_id, user_id, ARRAY['administrator']::text[] FROM claimed
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET roles = ARRAY['administrator']::text[], enabled = TRUE
  RETURNING user_id
)
SELECT EXISTS (SELECT 1 FROM granted)::boolean AS bootstrapped;

-- name: ResolveUserAuthorization :one
-- Fresh on every request; no JWT or cache may stand in for these liveness checks.
-- A live member without an assignment resolves to empty arrays (deny by default).
SELECT u.id AS user_id, o.id AS organization_id,
       COALESCE(a.enabled, TRUE)::boolean AS enabled,
       COALESCE(a.roles, '{}'::text[])::text[] AS roles,
       COALESCE(a.permissions, '{}'::text[])::text[] AS permissions
FROM "user" u
JOIN user_on_organization m ON m.user_id = u.id AND m.deleted_at IS NULL
JOIN organization o ON o.id = m.organization_id
LEFT JOIN user_organization_authorization a
  ON a.organization_id = m.organization_id AND a.user_id = u.id
WHERE u.id = sqlc.arg(user_id) AND o.id = sqlc.arg(organization_id)
  AND u.deleted_at IS NULL AND u.type = 'human'
  AND u.external_id NOT LIKE 'system:%'
  AND COALESCE(a.enabled, TRUE);

-- name: CountOrganizationAdministrators :one
-- Only live human members count. Called AFTER the organization lock.
SELECT COUNT(*) FROM user_organization_authorization a
JOIN "user" u ON u.id = a.user_id
JOIN user_on_organization m ON m.user_id = a.user_id AND m.organization_id = a.organization_id
JOIN organization o ON o.id = m.organization_id
WHERE o.id = sqlc.arg(organization_id)
  AND a.enabled AND 'administrator' = ANY(a.roles)
  AND u.deleted_at IS NULL AND u.type = 'human'
  AND u.external_id NOT LIKE 'system:%' AND m.deleted_at IS NULL;

-- name: ReplaceUserAuthorization :one
-- Storage adapter validates roles + pkg/scope.OrganizationScopes and guards the
-- last administrator under LockUserAuthorizationOrganization before this write.
INSERT INTO user_organization_authorization (organization_id, user_id, enabled, roles, permissions)
SELECT m.organization_id, u.id, sqlc.arg(enabled)::boolean, sqlc.arg(roles)::text[], sqlc.arg(permissions)::text[]
FROM "user" u
JOIN user_on_organization m ON m.user_id = u.id AND m.deleted_at IS NULL
JOIN organization o ON o.id = m.organization_id
WHERE u.id = sqlc.arg(user_id) AND o.id = sqlc.arg(organization_id)
  AND u.deleted_at IS NULL AND u.type = 'human'
  AND u.external_id NOT LIKE 'system:%'
ON CONFLICT (organization_id, user_id) DO UPDATE
  SET enabled = EXCLUDED.enabled, roles = EXCLUDED.roles, permissions = EXCLUDED.permissions
RETURNING enabled, roles, permissions;

-- name: GetOrganizationUser :one
SELECT u.id, u.external_id, u.name, u.email, u.created_at,
       COALESCE(a.enabled, TRUE)::boolean AS enabled,
       COALESCE(a.roles, '{}'::text[])::text[] AS roles,
       COALESCE(a.permissions, '{}'::text[])::text[] AS permissions
FROM "user" u
JOIN user_on_organization m ON m.user_id = u.id AND m.deleted_at IS NULL
JOIN organization o ON o.id = m.organization_id
LEFT JOIN user_organization_authorization a
  ON a.organization_id = m.organization_id AND a.user_id = u.id
WHERE u.id = sqlc.arg(user_id) AND o.id = sqlc.arg(organization_id)
  AND u.deleted_at IS NULL AND u.type = 'human'
  AND u.external_id NOT LIKE 'system:%';

-- name: ListOrganizationUsers :many
-- Stable keyset pagination. Fetch limit_plus_one for next-page detection.
SELECT u.id, u.external_id, u.name, u.email, u.created_at,
       COALESCE(a.enabled, TRUE)::boolean AS enabled,
       COALESCE(a.roles, '{}'::text[])::text[] AS roles,
       COALESCE(a.permissions, '{}'::text[])::text[] AS permissions
FROM "user" u
JOIN user_on_organization m ON m.user_id = u.id AND m.deleted_at IS NULL
JOIN organization o ON o.id = m.organization_id
LEFT JOIN user_organization_authorization a
  ON a.organization_id = m.organization_id AND a.user_id = u.id
WHERE o.id = sqlc.arg(organization_id)
  AND u.deleted_at IS NULL AND u.type = 'human'
  AND u.external_id NOT LIKE 'system:%'
  AND (sqlc.narg(cursor_id)::uuid IS NULL OR u.id > sqlc.narg(cursor_id)::uuid)
ORDER BY u.id
LIMIT sqlc.arg(limit_plus_one);

-- name: UpdateOrganizationUserProfile :one
-- Profiles are global identities, but mutation requires live membership in the
-- target org. Subject, type, membership and authorization are never editable here.
WITH updated AS (
UPDATE "user" u SET name = sqlc.arg(name), email = sqlc.arg(email)::text
FROM user_on_organization m JOIN organization o ON o.id = m.organization_id
WHERE u.id = m.user_id AND m.deleted_at IS NULL
  AND u.id = sqlc.arg(user_id) AND o.id = sqlc.arg(organization_id)
  AND u.deleted_at IS NULL AND u.type = 'human'
  AND u.external_id NOT LIKE 'system:%'
RETURNING u.id, u.external_id, u.name, u.email
), managed AS (
  INSERT INTO user_managed_profile (user_id) SELECT id FROM updated
  ON CONFLICT (user_id) DO NOTHING
)
SELECT id, external_id, name, email FROM updated;
