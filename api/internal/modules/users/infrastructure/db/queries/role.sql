-- name: ListOrganizationRoles :many
SELECT slug, name, description, permissions FROM user_organization_role
WHERE organization_id = sqlc.arg(organization_id) ORDER BY slug;

-- name: CreateOrganizationRole :one
INSERT INTO user_organization_role (organization_id, slug, name, description, permissions)
VALUES (sqlc.arg(organization_id), sqlc.arg(slug), sqlc.arg(name), sqlc.arg(description), sqlc.arg(permissions)::text[])
RETURNING slug, name, description, permissions;

-- name: UpdateOrganizationRole :one
UPDATE user_organization_role SET name=sqlc.arg(name), description=sqlc.arg(description), permissions=sqlc.arg(permissions)::text[]
WHERE organization_id=sqlc.arg(organization_id) AND slug=sqlc.arg(slug)
RETURNING slug, name, description, permissions;

-- name: OrganizationRoleAssigned :one
-- Include disabled and removed memberships: persisted assignments must not dangle.
SELECT EXISTS(SELECT 1 FROM user_organization_authorization
WHERE organization_id=sqlc.arg(organization_id) AND sqlc.arg(slug)::text = ANY(roles))::boolean;

-- name: DeleteOrganizationRole :execrows
DELETE FROM user_organization_role WHERE organization_id=sqlc.arg(organization_id) AND slug=sqlc.arg(slug);
