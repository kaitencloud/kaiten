-- name: CreateLicenseFamily :one
-- A family is created with the first version of a product and outlives every
-- one of them: it is what a rename cannot move and what a pricing URL can
-- point at. It carries no display name -- the current version's own name is
-- the display -- so there is nothing to pass here but the slug.
INSERT INTO license_family (organization_id, slug)
VALUES (sqlc.arg(organization_id),
        sqlc.arg(slug))
RETURNING *;


-- name: GetLicenseIdentityBySlug :one
-- What an update never changes about a license version and may have to check
-- against: its family -- to unset the previous default, and to refuse a
-- familyId that is not the row's own -- its version number, which is readOnly,
-- and its lifecycle state, which moves only through publish, archive and
-- unarchive. The last two are accepted on update only as an echo.
SELECT l.family_id, l.version, l.lifecycle_state
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.slug = sqlc.arg(slug);


-- name: GetLicenseFamilyForUpdate :one
-- Takes a row lock on the family so that concurrent version creations in it
-- serialize. The version number itself is assigned by
-- update_license_version(), which advances the family's last_version on this
-- same row; this lock exists because the caller also needs to *know* that
-- number before the INSERT, to derive the version's slug from it. Held to
-- commit, it keeps last_version where the caller read it, so last_version + 1
-- is the number the trigger then assigns.
SELECT *
FROM license_family
WHERE organization_id = sqlc.arg(organization_id)
  AND slug = sqlc.arg(slug)
FOR UPDATE;


-- name: GetLicenseFamiliesByIDs :many
-- Batch read for the GraphQL License.family dataloader. Organization-scoped
-- like every other read here, so a family id guessed from another tenant
-- resolves to nothing rather than to that tenant's family.
SELECT f.*
FROM license_family f
WHERE f.organization_id = sqlc.arg(organization_id)
  AND f.id = ANY (sqlc.arg(family_ids)::uuid[]);


-- name: ListLicenseFamiliesByCursor :many
-- Cursor (keyset) pagination over the organization's families, ordered by
-- created_at DESC, id DESC -- the same key every other list endpoint in this API
-- uses, backed by idx_license_family_org_created_at. Pass limit_plus_one =
-- requested limit + 1 so the caller can detect a further page without a COUNT.
--
-- version_count counts every version, whatever its lifecycle state: it answers
-- "how many versions does this product have" for a console rendering the
-- family, not "how many can be sold". The current version is resolved
-- separately (GetCurrentLicenseVersionsByFamilyIDs) rather than joined here,
-- because a LEFT JOIN would make all twelve license columns nullable in this
-- row type for the sake of a family that has nothing published.
SELECT f.*,
       (SELECT count(*) FROM license l WHERE l.family_id = f.id)::integer AS version_count
FROM license_family f
WHERE f.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (f.created_at, f.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY f.created_at DESC, f.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: GetCurrentLicenseVersionsByFamilyIDs :many
-- Resolves "the current version" for each of the given families, in one query
-- rather than one per family.
--
-- The rule, in the ORDER BY: the family's default version first, then the
-- highest-numbered one, among PUBLISHED versions only. is_default DESC puts
-- true ahead of false, and license_default_must_be_published_check guarantees a
-- default is always PUBLISHED, so the default -- when there is one -- always
-- wins this ordering rather than being filtered out of it.
--
-- A family with no PUBLISHED version simply returns no row, which is what makes
-- "draft only" representable in a list and what the family endpoint reports as
-- GetLicenseFamily.NoPublishedVersion.
SELECT DISTINCT ON (l.family_id) l.*
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.family_id = ANY (sqlc.arg(family_ids)::uuid[])
  AND l.lifecycle_state = 'PUBLISHED'
ORDER BY l.family_id, l.is_default DESC, l.version DESC;


-- name: GetLicenseFamilyBySlug :one
SELECT f.*
FROM license_family f
WHERE f.organization_id = sqlc.arg(organization_id)
  AND f.slug = sqlc.arg(slug);


-- name: CountLicenseVersionsInFamily :one
-- Organization-scoped like every other read here. The family id its callers
-- pass already came out of an organization-scoped lookup, so the filter is not
-- what stands between one tenant and another's count -- it is here so that
-- stays true of the query itself rather than of the two call sites that happen
-- to precede it today.
SELECT count(*)::integer AS version_count
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.family_id = sqlc.arg(family_id);


-- name: GetLicenseVersionInFamily :one
-- Explicit historical access: ?version=N on the family endpoint resolves a
-- version by number regardless of lifecycle state, archived included. Pinned
-- access stays pinned -- that is the whole point of addressing a version rather
-- than a family.
SELECT l.*
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.family_id = sqlc.arg(family_id)
  AND l.version = sqlc.arg(version);


-- name: ListLicenseVersionsInFamily :many
-- The ?include=versions view: every version of the family, oldest first, with
-- its lifecycle state. Unbounded on purpose -- it is the version history of one
-- product, which is bounded by how many times a vendor has published it.
SELECT l.*
FROM license l
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.family_id = sqlc.arg(family_id)
ORDER BY l.version;


-- name: GetLicenseFamilyByIDForUpdate :one
-- The identifier form of GetLicenseFamilyForUpdate, for a create that names
-- the family by familyId rather than by slug -- the handle the console holds,
-- since a license's representation carries its family's id and not its slug.
-- Same lock, same reasons.
SELECT *
FROM license_family
WHERE organization_id = sqlc.arg(organization_id)
  AND id = sqlc.arg(id)
FOR UPDATE;


-- name: LockLicenseFamilyOfLicense :one
-- Takes the family row lock on behalf of a version delete, before the version
-- row goes. It is the same lock GetLicenseFamilyForUpdate takes before a
-- version is added, so the two serialize on it in the same order, and it is
-- what lets DeleteLicenseFamilyIfEmpty trust its count: nothing can join the
-- family between that count and the delete.
SELECT f.id
FROM license_family f
       JOIN license l ON l.family_id = f.id
WHERE l.organization_id = sqlc.arg(organization_id)
  AND l.slug = sqlc.arg(slug)
FOR UPDATE OF f;


-- name: DeleteLicenseFamilyIfEmpty :execrows
-- A family does not outlive its last version: with nothing left to resolve
-- to it would be a listed product with nothing in it, and a slug reserved
-- with no way to release it. Conditional on the count so that deleting one
-- version of several leaves the family exactly as it was. Only sound under
-- the lock LockLicenseFamilyOfLicense takes in the same transaction. The row
-- count says whether the family went, which is when the organization's
-- licenses usage goes down.
DELETE
FROM license_family f
WHERE f.organization_id = sqlc.arg(organization_id)
  AND f.id = sqlc.arg(family_id)
  AND NOT EXISTS (SELECT 1 FROM license l WHERE l.family_id = f.id);


-- name: SetLicenseFamilyPublic :one
-- Lists the family in the public catalogue, or takes it out. updated_at is
-- left alone: it says when a version was last added.
UPDATE license_family
SET is_public = sqlc.arg(is_public)
WHERE organization_id = sqlc.arg(organization_id)
  AND slug = sqlc.arg(slug)
RETURNING id;
