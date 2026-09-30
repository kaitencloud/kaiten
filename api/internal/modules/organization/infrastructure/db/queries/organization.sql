-- name: CreateOrganization :one
INSERT INTO organization (id, external_id, name)
VALUES (COALESCE(sqlc.narg(id), gen_random_uuid()), sqlc.arg(external_id), sqlc.arg(name))
RETURNING *;


-- name: EnsureOrganization :one
-- The same upsert JIT provisioning already performs (internal/platform/jit's
-- resolveOrganization), exposed for kaiten-admin-tools so a stack can be
-- bootstrapped before the API is listening. Idempotent by external_id, which is
-- the identity: the id is derived from it (externalid.DeriveOrganizationID), so a
-- re-run converges on the same row rather than creating a second tenant.
--
-- The AFTER INSERT trigger on this table gives system:kaiten its membership, so
-- an organization created here is immediately mintable-into.
--
-- An empty name means "don't decide the name here": on insert it falls back to
-- the external id, on conflict it leaves whatever name the row already has. That
-- is what makes `organization ensure --external-id X` safe to re-run against an
-- organization a human has since renamed -- without it, the caller would have to
-- read the current name back and pass it in, and lose the race to do so.
INSERT INTO organization (id, external_id, name)
-- The ::text cast is load-bearing: without it sqlc cannot infer a type through
-- the nested COALESCE/NULLIF and emits the parameter as interface{}.
VALUES (sqlc.arg(id), sqlc.arg(external_id),
        COALESCE(NULLIF(sqlc.arg(name)::text, ''), sqlc.arg(external_id)))
ON CONFLICT (external_id) DO UPDATE
  SET name = COALESCE(NULLIF(sqlc.arg(name), ''), organization.name)
RETURNING *;


-- name: UpdateOrganization :exec
UPDATE organization
SET name = $1
WHERE id = sqlc.arg(id);


-- name: UpdateOrganizationExternalID :exec
UPDATE organization
SET external_id = sqlc.arg(external_id)
WHERE id = sqlc.arg(id)
  AND external_id IS DISTINCT FROM sqlc.arg(external_id);


-- name: UpdateOrganizationIdentity :one
UPDATE organization
SET external_id = sqlc.arg(external_id),
    name        = sqlc.arg(name)
WHERE id = sqlc.arg(id)
RETURNING *;


-- name: DeleteOrganization :execresult
-- A real delete. Every one of the twenty-three tables carrying an
-- organization_id references organization ON DELETE CASCADE, so this single
-- statement takes the whole tenant with it: customers, licenses, feature
-- flags, entitlements and their usage, instances, deployment zones, releases,
-- components, metadata fields, memberships, service accounts and their
-- tokens, the audit trail and any pending outbox events. That is deliberately
-- not enumerated here -- enumerating it is how a table added later gets
-- forgotten.
--
-- None of it is recoverable. Without a usage ledger the organization's usage
-- history cannot be rebuilt by replaying events.
DELETE
FROM organization
WHERE id = sqlc.arg(id)
RETURNING id;


-- name: GetAllOrganizations :many
SELECT *
FROM organization;


-- name: GetOrganization :one
SELECT *
FROM organization
WHERE id = $1;


-- name: GetOrganizationByExternalID :one
SELECT *
FROM organization
WHERE external_id = sqlc.arg(external_id);


-- name: OrganizationExists :one
-- Target-organization resolution needs to know only whether a tenant is there,
-- not what it contains: it runs on every Platform API operation that names an
-- {orgId}, ahead of the use case, and a full row read would be an unused
-- SELECT * on the hot path. The caller is internal/kaiten's bindTarget, which
-- runs it after the scope check so a 404 cannot answer a question the caller
-- lacks the scope to ask. organization has had no deleted_at since
-- 20260816030000_hard_delete_organization.sql, so presence is liveness.
SELECT EXISTS (SELECT 1 FROM organization WHERE id = sqlc.arg(id));


-- name: ResolveSystemActorInOrganization :one
-- The acting user for work Kaiten does on its own behalf inside one organization:
-- system:kaiten's row, joined to its membership in that organization.
--
-- Resolved by external_id rather than by the pinned UUID, which is this identity's
-- own rule (see internal/platform/platformidentity): a database where the row
-- somehow exists under a different id must converge on the identity rather than
-- fork a second one. The membership trigger
-- (ensure_kaiten_system_user_membership_for_org) was changed to do exactly this,
-- after the UUID-keyed version "silently never got a membership".
--
-- Both halves are required, and no row is the honest answer when either is missing.
-- An organization that is gone has no membership, and an organization whose
-- membership was somehow removed must stop the work rather than have it done by a
-- non-member -- so the caller decides between DROP and RETRY by asking
-- OrganizationExists, instead of this query guessing.
SELECT u.id
FROM "user" u
       JOIN user_on_organization m
            ON m.user_id = u.id
              AND m.organization_id = sqlc.arg(organization_id)
              AND m.deleted_at IS NULL
WHERE u.external_id = sqlc.arg(external_id);
