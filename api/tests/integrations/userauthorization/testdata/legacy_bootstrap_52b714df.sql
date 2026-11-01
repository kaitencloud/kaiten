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
