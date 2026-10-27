-- name: GetAllLicenses :many
-- Unbounded on purpose: also used by the seeder (seedkit/dogfooding.go),
-- which needs every license in the organization, not one page.
-- GetAllLicensesByCursor (below) is the cursor-paginated variant for
-- list-facing callers (REST getlicenses, GraphQL Query.licenses).
SELECT l.*
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id);


-- name: GetAllLicensesByCursor :many
-- Cursor (keyset) pagination: ordered by created_at DESC, id DESC (id
-- tie-breaks created_at, which is not guaranteed unique). Pass
-- limit_plus_one = requested limit + 1 so the caller can detect whether a
-- further page exists without a separate COUNT query. On the first page,
-- pass NULL for both cursor_created_at and cursor_id.
SELECT l.*
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (l.created_at, l.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY l.created_at DESC, l.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: CreateLicense :one
-- version is deliberately absent from the column list: update_license_version()
-- (BEFORE INSERT) assigns it the next number from its family's counter, and
-- version_name defaults from it. Passing a value here only looked
-- like it decided something -- the trigger overwrote it before the row was
-- written. NOT NULL still holds: the trigger runs before the
-- constraint is checked.
--
-- family_id, by contrast, is required from the caller and is what the trigger
-- reads: it is the row that says which product this is a version of. Nothing
-- infers it from name.
INSERT INTO license (name, slug, description, type, version_name, is_default, features, organization_id, family_id,
                     lifecycle_state, pricing_type, trial_period_days, requires_payment_method, self_serve_cta_url)
VALUES ($1,
       $2,
       $3,
       $4,
       $5,
       $6,
       $7,
       sqlc.arg(organization_id),
       sqlc.arg(family_id),
       sqlc.arg(lifecycle_state),
       sqlc.arg(pricing_type),
       sqlc.narg(trial_period_days),
       sqlc.arg(requires_payment_method),
       sqlc.narg(self_serve_cta_url))
RETURNING *;


-- name: GetOneLicense :one
SELECT l.*
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.slug = sqlc.arg(slug);



-- name: UnsetFamilyDefault :many
-- Switches the family's default off on every version but the one slugged
-- kept_license_slug -- on all of them when it is NULL, as when the version
-- taking the default does not exist yet -- and returns the versions it changed.
--
-- Keyed on family_id, not on name: a display label is shared by neither the
-- family nor a subset of it once a version is renamed. The caller still has to
-- make this write before setting a default, but it is not what guarantees one
-- default per family -- license_family_id_is_default_key refuses a second
-- outright.
--
-- A version losing the default is changed as much as the one gaining it, so it
-- gets a new updated_at, and the rows come back for the caller to announce
-- (familydefault.Announce).
UPDATE license
SET is_default = FALSE,
    updated_at = now()
WHERE organization_id = sqlc.arg(organization_id)
  AND is_default = TRUE
  AND family_id = sqlc.arg(family_id)
  AND slug IS DISTINCT FROM sqlc.narg(kept_license_slug)
RETURNING *;


-- name: EditLicense :one
-- Writes what an update may change. lifecycle_state is not part of it: a
-- version moves through publish, archive and unarchive, which apply the
-- lifecycle rules and record their events. is_default is written
-- as sent, and license_default_must_be_published_check refuses a default that
-- is not PUBLISHED.
--
-- The commercial columns are keep-if-absent: a NULL argument leaves the
-- column as it is, so a client that predates them (or sends a representation
-- without them) never resets them. trial_period_days and self_serve_cta_url
-- are cleared by their *_clear flags rather than by NULL, which already means
-- "keep".
UPDATE license l
SET name        = sqlc.arg(name),
    description = sqlc.arg(description),
    type        = sqlc.arg(type),
    version_name = sqlc.narg(version_name),
    is_default  = sqlc.arg(is_default),
    features    = sqlc.arg(features),
    pricing_type = COALESCE(sqlc.narg(pricing_type)::pricing_type, l.pricing_type),
    trial_period_days = CASE
      WHEN sqlc.arg(trial_period_days_clear)::bool THEN NULL
      ELSE COALESCE(sqlc.narg(trial_period_days)::integer, l.trial_period_days)
    END,
    requires_payment_method = COALESCE(sqlc.narg(requires_payment_method)::bool, l.requires_payment_method),
    self_serve_cta_url = CASE
      WHEN sqlc.arg(self_serve_cta_url_clear)::bool THEN NULL
      ELSE COALESCE(sqlc.narg(self_serve_cta_url)::text, l.self_serve_cta_url)
    END,
    updated_at  = now()
FROM user_on_organization uo
WHERE uo.organization_id = sqlc.arg(organization_id)
       AND uo.user_id = sqlc.arg(user_id)
       AND uo.deleted_at IS NULL
       AND l.organization_id = uo.organization_id
       AND l.slug = sqlc.arg(slug)
RETURNING l.*;


-- name: DeleteLicense :one
DELETE
FROM license l
WHERE l.slug = sqlc.arg(slug)
       AND organization_id = sqlc.arg(organization_id)
RETURNING l.*;


-- name: GetLicensesByIDs :many
SELECT l.*
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.id = ANY (sqlc.arg(license_ids)::uuid[]);


-- name: LockLicenseLifecycleStateBySlug :one
-- Reads a version's lifecycle state under a row lock, so the transition that
-- follows in the same transaction moves the state it checked. The lock also
-- serializes an archive with an instance assignment, whose trigger locks the
-- same row FOR SHARE. FOR NO KEY UPDATE is the mode the transition's UPDATE
-- takes anyway: it changes no key column, so it has no reason to block the
-- foreign-key checks of rows inserted against the version meanwhile (an
-- entitlement grant, for one).
SELECT l.lifecycle_state
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.slug = sqlc.arg(slug)
FOR NO KEY UPDATE;


-- name: TransitionLicenseLifecycleState :one
-- Moves one version from one lifecycle state to another, and only from that
-- one: the from_state guard restates the rule the caller checked under the
-- lock. The membership join is EditLicense's. is_default is untouched, so
-- license_default_must_be_published_check refuses archiving a family's
-- default.
UPDATE license l
SET lifecycle_state = sqlc.arg(to_state)::license_lifecycle_state,
    updated_at      = now()
FROM user_on_organization uo
WHERE uo.organization_id = sqlc.arg(organization_id)
       AND uo.user_id = sqlc.arg(user_id)
       AND uo.deleted_at IS NULL
       AND l.organization_id = uo.organization_id
       AND l.slug = sqlc.arg(slug)
       AND l.lifecycle_state = sqlc.arg(from_state)::license_lifecycle_state
RETURNING l.*;
