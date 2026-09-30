-- name: CreateUser :one
INSERT INTO "user" (id, external_id, email, name)
VALUES (COALESCE(sqlc.narg(id), gen_random_uuid()), sqlc.arg(external_id), sqlc.arg(email), sqlc.arg(name))
RETURNING *;

-- name: EnsureUser :one
-- The upsert JIT provisioning performs on the authentication path, keyed on the
-- identity provider's subject. Idempotent by external_id, which is the identity:
-- the id is derived from it (externalid.DeriveUserID), so a re-login converges on
-- the same row rather than creating a second user.
--
-- deleted_at is returned and never written. A soft-deleted user is reported to the
-- caller, which refuses the login, rather than being resurrected here --
-- re-joining is an explicit operation, not a side effect of authenticating.
--
-- The insert and the conflict branch take different parameters on purpose. email
-- and name are what the row should hold if it is created, fallbacks already
-- applied (a synthetic address, the subject as a display name), so a provider that
-- sends neither claim still produces a valid row. email_claim and name_claim are
-- the raw claims: empty means "the provider said nothing", which leaves the stored
-- value alone -- so those fallbacks are one-time defaults and cannot overwrite what
-- a human later set. The ::text casts are load-bearing, exactly as in
-- EnsureOrganization: without them sqlc cannot infer a type through the nested
-- COALESCE/NULLIF, nor through a nullable column, and emits interface{}.
--
-- CAUTION: "user".email carries a UNIQUE constraint. An insert whose email belongs
-- to a different external_id fails the transaction instead of silently reassigning
-- the address.
INSERT INTO "user" (id, external_id, email, name)
VALUES (sqlc.arg(id), sqlc.arg(external_id), sqlc.arg(email)::text, sqlc.arg(name))
ON CONFLICT (external_id) DO UPDATE
  SET email = COALESCE(NULLIF(sqlc.arg(email_claim)::text, ''), "user".email),
      name  = COALESCE(NULLIF(sqlc.arg(name_claim)::text, ''), "user".name)
RETURNING id, deleted_at;

-- name: UpdateUserEmail :exec
UPDATE "user"
SET email = sqlc.arg(email)
WHERE id = sqlc.arg(id)
  AND (
    email IS NULL
      OR email LIKE '%' || '@kaiten-internal.sh'
      OR email IS DISTINCT FROM sqlc.arg(email)
  );

-- name: UpdateUserName :exec
UPDATE "user"
SET name = sqlc.arg(name)
WHERE id = sqlc.arg(id)
  AND name IS DISTINCT FROM sqlc.arg(name);

-- name: GetUserByExternalID :one
SELECT *
FROM "user"
WHERE external_id = sqlc.arg(external_id);

-- name: ListLiveUsersByExternalIDPrefix :many
-- Backs `kaiten-admin-tools` shell completion for a user's external id, which is
-- an opaque provider id nobody types from memory.
--
-- Live users only: the commands that take this id operate on a user who is still
-- there, and offering a soft-deleted one would complete straight into an error.
--
-- The LIMIT is not a page, it is a ceiling on a completer: this runs on a
-- keystroke, and a shell that is handed ten thousand candidates is a shell that
-- stops responding. An operator whose prefix is still ambiguous after this many
-- matches needs to type one more character, which is what completion is for.
SELECT id, external_id, name, email
FROM "user"
WHERE deleted_at IS NULL
  AND external_id LIKE sqlc.arg(external_id_prefix) || '%'
ORDER BY external_id
LIMIT sqlc.arg(max_results);

-- name: GetUserByEmail :one
SELECT *
FROM "user"
WHERE email = sqlc.arg(email);

-- name: GetUser :one
SELECT *
FROM "user"
WHERE id = sqlc.arg(id);

-- name: UpdateUserExternalID :exec
UPDATE "user"
SET external_id = sqlc.arg(external_id)
WHERE id = sqlc.arg(id)
  AND external_id IS DISTINCT FROM sqlc.arg(external_id);

-- name: DeleteUser :execresult
UPDATE "user"
SET deleted_at = now()
WHERE id = sqlc.arg(id)
  AND deleted_at IS NULL
RETURNING id;
