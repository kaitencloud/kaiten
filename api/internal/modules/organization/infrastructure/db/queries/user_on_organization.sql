-- name: CreateUserOnOrganization :execresult
INSERT INTO user_on_organization (user_id, organization_id)
VALUES (sqlc.arg(user_id), sqlc.arg(organization_id))
ON CONFLICT (organization_id, user_id) DO UPDATE
SET deleted_at = NULL;


-- name: EnsureUserOnOrganization :one
-- The membership half of JIT provisioning, and deliberately not
-- CreateUserOnOrganization.
--
-- Two differences, both load-bearing. It does not resurrect: the conflict branch
-- assigns deleted_at to itself, which is a no-op write that exists only so the
-- RETURNING clause has a row to return on the conflict path. A member who was
-- removed from an organization stays removed, and presenting a fresh token does not
-- undo that -- CreateUserOnOrganization's SET deleted_at = NULL is exactly the
-- behaviour the authentication path must not have. And it reads deleted_at back, so
-- the caller can refuse the login rather than silently treating a removed member as
-- present.
INSERT INTO user_on_organization (user_id, organization_id)
VALUES (sqlc.arg(user_id), sqlc.arg(organization_id))
ON CONFLICT (organization_id, user_id) DO UPDATE
SET deleted_at = user_on_organization.deleted_at
-- inserted says whether this call created the membership: xmax is 0 on a row
-- this statement inserted, and the transaction's id on one the conflict branch
-- updated. It is what lets the caller count a seat once per membership rather
-- than once per login.
RETURNING deleted_at, (xmax = 0)::boolean AS inserted;


-- name: DeleteUserOnOrganization :execresult
UPDATE user_on_organization uoo
SET deleted_at = now()
WHERE uoo.user_id = sqlc.arg(user_id)
  AND uoo.organization_id = sqlc.arg(organization_id)
  AND uoo.deleted_at IS NULL;


-- name: ListActiveOrganizationIDsForUser :many
-- The organizations a user is a live member of: what a deleted user stops
-- occupying a seat in.
SELECT organization_id
FROM user_on_organization
WHERE user_id = sqlc.arg(user_id)
  AND deleted_at IS NULL
ORDER BY organization_id;
