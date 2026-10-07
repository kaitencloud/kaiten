-- +goose Up
-- +goose StatementBegin
-- a license row was both a product and a version of it. The family a
-- version belonged to was never stored -- it was inferred from the mutable
-- "name" column -- and nothing said whether a version may be served. This
-- migration gives the product a row of its own (license_family), gives every
-- version a lifecycle state (license_lifecycle_state), and retires the
-- name-keyed uniqueness that stood in for the family. It also keeps an archived
-- version from being assigned to an instance.
--
-- It squashes the three migrations that landed this change before reaching
-- main: 20260902000000_license_family.sql,
-- 20260903000000_license_lifecycle_state.sql and
-- 20260904000000_drop_license_name_version_key.sql. None of them
-- was applied anywhere but developer machines and test containers -- release
-- images are built from main and tags only -- so there is no schema history to
-- preserve, the same reasoning as 20260810000000_squash_initial_schema.sql.
-- Sections 1 and 2 reproduced the end state the three left behind, statement
-- for statement: verified by diffing pg_dump --schema-only of a database
-- migrated through the three against one migrated through the squash, and its
-- Down against a database that never had them. Changes came after
-- the squash, before any of this reached main: section 2 drops the
-- lifecycle_state default once the backfill is done, section 3 was added, and
-- the family gained its version counter (last_version) and the
-- (id, organization_id) key its versions reference.
--
-- This file was 20260902000000_license_family.sql until 26.10.0. It merged
-- after 20260916000000_notifications.sql had been released, so every database
-- running that release had a newer version applied than this pending one, and
-- goose refused to upgrade it ("missing (out-of-order) migration"). Renumbering
-- it past the newest released migration keeps goose strict about order. A
-- database built from main between the two -- a developer machine -- already
-- has this schema under the old version; record it under the new one instead
-- of re-running it:
--
--   UPDATE goose_db_version SET version_id = 20261007000000
--   WHERE version_id = 20260902000000;
--
-- A database that applied some of the three, or an earlier state of this file,
-- should be reset (`task reset`) rather than migrated onto it: goose sees this
-- version as applied and would skip whatever it has not run.

-- ── 1. The family ─────────────────────────────────────────────────────────
-- update_license_version() took MAX(version) + 1 over the rows sharing
-- (name, organization_id), and is_default was managed by an
-- application-level UPDATE ... WHERE name = $1. Renaming one version therefore
-- detached it from its own family -- its next version restarted at 1,
-- is_default desynchronized, and the catalogue showed two families where there
-- was one. The billing spec worked around it by freezing name after
-- publication, which is an application guard over a model-level problem.
--
-- license_family carries identity -- a slug that is stable across renames and
-- republications, and addressable on its own -- and nothing else. No display
-- name, because the display name is the current version's own name, and
-- duplicating it on the family would recreate the mutable-key problem this
-- migration removes. No created_by_id/updated_by_id, unlike
-- license_entitlement or instance: license has never carried them (
-- added created_at/updated_at and nothing else), so the backfill below would
-- have no author to attribute these rows to.
--
-- last_version is the family's version counter: the highest number any of its
-- versions has ever taken, deleted ones included (see update_license_version()
-- below). updated_at moves with it, so it says when a version was last added.
--
-- (id, organization_id) is unique so that license can reference the pair, as
-- 20260815000000 made instance reference its customer and license:
-- a version can then only belong to a family of its own organization, whatever
-- write path sets family_id.
CREATE TABLE "license_family"
(
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID         NOT NULL,
  "slug"            TEXT         NOT NULL,
  "last_version"    INTEGER      NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "license_family_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "license_family_id_organization_id_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "license_family_organization_id_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "license_family_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "license" ADD COLUMN "family_id" UUID;

-- Backfill, part 1: one family per distinct (organization_id, name), which is
-- precisely the grouping the trigger and the is_default management treated as
-- a family -- so existing rows keep the family they behaved as members of, and
-- no version numbering moves.
--
-- The family's slug is taken from the group's lowest-version row: the slug the
-- catalogue has been addressing for longest, and the one a pricing URL is most
-- likely to already point at. (version, id) orders the group so the choice is
-- deterministic; id breaks a tie that license_name_version_organization_id_key
-- still makes impossible at this point of the migration, and costs nothing to
-- rule out anyway.
--
-- No collision suffix is needed: the slug is copied from a license row,
-- license slugs are already UNIQUE (organization_id, slug), and each group
-- contributes exactly one of them. The application create path does need
-- conflict handling -- a license slug can be freed by a delete while the
-- family named after it survives through its other versions -- and that lives
-- in the repository, discriminated on license_family_organization_id_slug_key.
INSERT INTO "license_family" ("organization_id", "slug")
SELECT "organization_id", "slug"
FROM (SELECT DISTINCT ON ("organization_id", "name") "organization_id", "name", "slug"
      FROM "license"
      ORDER BY "organization_id", "name", "version", "id") AS "lowest_version_row";

-- Backfill, part 2: point every version at the family created for its group.
-- The DISTINCT ON and its ORDER BY are the same as the INSERT above, and have
-- to stay that way -- they are how a row finds the family named after its
-- group's lowest version.
WITH "lowest_version_row" AS (SELECT DISTINCT ON ("organization_id", "name") "organization_id", "name", "slug"
                              FROM "license"
                              ORDER BY "organization_id", "name", "version", "id")
UPDATE "license" l
SET "family_id" = f."id"
FROM "lowest_version_row"
       JOIN "license_family" f
         ON f."organization_id" = "lowest_version_row"."organization_id"
           AND f."slug" = "lowest_version_row"."slug"
WHERE l."organization_id" = "lowest_version_row"."organization_id"
  AND l."name" = "lowest_version_row"."name";

-- Backfill, part 3: each family's counter starts at the highest version its
-- group already has, so the next version continues the sequence.
UPDATE "license_family" f
SET "last_version" = (SELECT MAX(l."version") FROM "license" l WHERE l."family_id" = f."id");

-- CASCADE, not the RESTRICT that instance.license_id and
-- license_entitlement.license_id use. Those protect a license from being
-- deleted out from under something that depends on it; this one is the other
-- direction -- a version cannot outlive the family it is a version of (and the
-- RESTRICT on instance.license_id still refuses deleting a family one of whose
-- versions an instance is pinned to). It also keeps organization deletion
-- working: that is a hard delete cascading into every organization-scoped
-- table, license and license_family included, and a
-- RESTRICT between two tables both being cascaded into can block depending on
-- the order they are processed in.
--
-- The key is (family_id, organization_id), not family_id alone: family_id can
-- come from a request body (POST /licenses takes familyId), and the schema --
-- not each query's organization filter -- is what keeps a version out of
-- another organization's family (see 20260815000000).
ALTER TABLE "license" ALTER COLUMN "family_id" SET NOT NULL;
ALTER TABLE "license"
  ADD CONSTRAINT "license_family_id_fkey"
    FOREIGN KEY ("family_id", "organization_id")
    REFERENCES "license_family" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One default per family was only ever an application convention: the write
-- path cleared the others just before setting one, and any path that forgot --
-- or two calls interleaving -- left two defaults with nothing to complain. The
-- partial unique index below makes it a database guarantee, so this first
-- normalizes the rows that convention let through. The highest version wins,
-- since a family's default is meant to be its current version; the losers are
-- switched off, not deleted. (version, id) breaks the tie deterministically, in
-- the shape used in 20260815010000.
UPDATE "license" demoted
SET "is_default" = FALSE
WHERE demoted."is_default"
  AND EXISTS (SELECT 1
              FROM "license" kept
              WHERE kept."family_id" = demoted."family_id"
                AND kept."is_default"
                AND (kept."version", kept."id") > (demoted."version", demoted."id"));

CREATE UNIQUE INDEX "license_family_id_is_default_key" ON "license" ("family_id") WHERE "is_default";

-- license_family_id_version_key takes over what gives a version number its
-- meaning, and doubles as the index every per-family read of license uses
-- (family_id leads it, so an index on family_id alone would only duplicate it).
--
-- license_name_version_organization_id_key, which played that role on
-- (name, version, organization_id), goes. Kept, it contradicted the model it
-- was kept under: every family starts at version 1, so two families in one
-- organization could not share a display name at all, and a rename could fail
-- on a (name, version) another family happened to hold. The name is a display
-- label: two products may share one, and only family_id says which
-- rows are the same product. Nothing leans on the old key to catch a repeated
-- name either: the console names the family a new version joins by familyId.
ALTER TABLE "license"
  ADD CONSTRAINT "license_family_id_version_key" UNIQUE ("family_id", "version");
ALTER TABLE "license" DROP CONSTRAINT "license_name_version_organization_id_key";

-- Re-keyed on family_id: the sequence a version draws from is now attached to
-- a row that renaming cannot move, and kept on that row. The number is the
-- family's counter plus one, taken by the same UPDATE that advances it, rather
-- than MAX(version) + 1 over the versions that still exist: deleting the
-- highest version would otherwise hand its number -- and the {familySlug}-v{n}
-- slug built from it -- to the next version, and ?version=N or a stored slug
-- would silently address a different row.
--
-- The UPDATE also replaces the earlier advisory lock: it locks the family row to
-- commit, so a second concurrent insert into the family waits and then reads
-- the counter the first one left. createlicense already holds that row FOR
-- UPDATE, which is how it knows the number before the INSERT. A family missing
-- from the version's organization is reported as the foreign key reports it,
-- under its name: left to the key, which is checked at the end of the
-- statement, the INSERT would first meet license_family_id_version_key and
-- name the wrong rule. The trigger itself is not recreated:
-- update_license_version_trigger already points at this function by name.
CREATE OR REPLACE FUNCTION update_license_version()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
BEGIN
UPDATE public."license_family"
SET "last_version" = "last_version" + 1,
    "updated_at"   = CURRENT_TIMESTAMP
WHERE "id" = NEW."family_id"
  AND "organization_id" = NEW."organization_id"
RETURNING "last_version" INTO NEW.version;
IF NOT FOUND THEN
  RAISE EXCEPTION 'license family % does not exist in organization %', NEW."family_id", NEW."organization_id"
    USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'license_family_id_fkey';
END IF;
NEW."version_name" := COALESCE(NEW."version_name", CONCAT('Version - ', NEW.version));
RETURN NEW;
END;
$$;

-- ── 2. The lifecycle state ────────────────────────────────────────────────
-- Nothing on a version said whether it may be served, so "the current version
-- of this family" had no answer to give and every consumer went on hard-coding
-- a version slug.
--
-- Several versions of one family may be PUBLISHED at once -- a vendor can keep
-- more than one purchasable -- which is why this is a state per version and not
-- a "current version" pointer on the family. Resolution picks between them
-- (the family's default first, then the highest published version); that is a
-- read-time rule, not something the schema should collapse.
--
-- An enum rather than a boolean because DRAFT and ARCHIVED are not the same
-- thing to anyone but the resolver: "not published yet" and "withdrawn from
-- sale" differ for the console rendering them, for the vendor deciding what to
-- do next, and for the reader of a row six months later. It matches
-- instance_status and license_type, the other states in this schema.
--
-- Why this is not is_active coming back. 20260815130000 dropped that column
-- because it was documented as "whether the license is
-- currently active and can be used" while no query filtered on it. This one is
-- read -- the family resolution endpoints select on it, and the check
-- constraint below enforces it -- and that is the whole difference.
CREATE TYPE "license_lifecycle_state" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- Existing rows are backfilled to PUBLISHED by the DEFAULT, which Postgres
-- applies to every present row when a NOT NULL column with a default is added.
-- It is the only safe value: those rows are live, instances are pinned to them
-- through instance.license_id, and calling them DRAFT would make families that
-- work today resolve to nothing.
--
-- The default goes once the backfill is done. New rows get their state from the
-- one write path that creates versions, where "PUBLISHED unless the caller asks
-- for a draft" is a rule of the API (createlicense). Kept here, it would say the
-- same thing a second time and decide for any INSERT that forgot the column,
-- publishing a version nobody chose to publish; without it such an INSERT
-- fails on NOT NULL instead.
ALTER TABLE "license"
  ADD COLUMN "lifecycle_state" "license_lifecycle_state" NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "license"
  ALTER COLUMN "lifecycle_state" DROP DEFAULT;

-- is_default is the version a family puts forward, and resolution hands it out
-- first, so a default that may not be served would be a family whose own
-- answer the catalogue has to hide. As a constraint rather than an application
-- check it also makes resolution total: a family with a default always has
-- something to resolve to. The cost is that archiving the default is refused
-- rather than silently unsetting it, which is the right way round -- dropping a
-- family's default is a decision, not a side effect of withdrawing a version.
ALTER TABLE "license"
  ADD CONSTRAINT "license_default_must_be_published_check"
  CHECK (NOT "is_default" OR "lifecycle_state" = 'PUBLISHED');

-- GET /license-families keysets on (created_at DESC, id DESC) like every other
-- list endpoint, so license_family needs the same index license has: one range
-- scan per page instead of sorting the organization's whole catalogue.
CREATE INDEX "idx_license_family_org_created_at"
  ON "license_family" ("organization_id", "created_at" DESC, "id" DESC);

-- ── 3. What an archived version refuses ──────────────────────────────────
-- ARCHIVED means withdrawn from sale. An instance already pinned to a version
-- keeps it when the version is archived -- pinned access stays pinned, and
-- nothing here touches existing rows -- but a new assignment is a sale, so no
-- instance may be created on an archived version or moved onto one. DRAFT is
-- allowed on purpose: a vendor tests a version on an instance before
-- publishing it.
--
-- A trigger rather than a check in each write path, for the reason the
-- constraints above are constraints: instances are created by POST /instances,
-- by the integration upsert and by the seeder, and moved by
-- PUT /instances/{slug}. It only looks at license_id when that is being set --
-- on insert, or on an update that changes it -- so an instance pinned to a
-- version that was archived afterwards stays editable.
--
-- The license row is locked FOR SHARE whatever its state, which conflicts with
-- the row lock an archiving UPDATE takes: an archive and an assignment of the
-- same version serialize, and whichever runs second sees the other's outcome.
-- The lookup is scoped to the instance's organization, like the composite
-- foreign key, so another organization's license is reported by that key as
-- not found rather than revealed as archived here. The error names a
-- constraint so the write paths map it to a 422 without parsing the message.
--
-- Two triggers run the function: BEFORE INSERT, and AFTER UPDATE OF
-- license_id. A BEFORE UPDATE row trigger makes PostgreSQL lock the old row by
-- the statement's SET list rather than by what changes, and EditInstance
-- always sets slug, a key column: every PUT /instances would then hold FOR
-- UPDATE instead of FOR NO KEY UPDATE, and block the foreign-key checks of
-- rows inserted against the instance (audit trail, entitlement usage,
-- integrations) until it commits. An AFTER trigger takes no such lock, and
-- its error still aborts the statement.
CREATE FUNCTION instance_license_not_archived()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
DECLARE
  assigned_state license_lifecycle_state;
BEGIN
IF TG_OP = 'UPDATE' AND NEW."license_id" IS NOT DISTINCT FROM OLD."license_id" THEN
  RETURN NEW;
END IF;
SELECT l."lifecycle_state"
INTO assigned_state
FROM public."license" l
WHERE l."id" = NEW."license_id"
  AND l."organization_id" = NEW."organization_id"
FOR SHARE;
IF assigned_state = 'ARCHIVED' THEN
  RAISE EXCEPTION 'license % is archived and cannot be assigned to an instance', NEW."license_id"
    USING ERRCODE = 'check_violation', CONSTRAINT = 'instance_license_not_archived';
END IF;
RETURN NEW;
END;
$$;

CREATE TRIGGER "instance_license_not_archived_insert_trigger"
  BEFORE INSERT ON "instance"
  FOR EACH ROW EXECUTE FUNCTION instance_license_not_archived();

CREATE TRIGGER "instance_license_not_archived_update_trigger"
  AFTER UPDATE OF "license_id" ON "instance"
  FOR EACH ROW EXECUTE FUNCTION instance_license_not_archived();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- In reverse order, except that the name-keyed uniqueness comes back first, as
-- 20260810000000_squash_initial_schema.sql declared it. It fails if two rows in
-- one organization share (name, version) -- two products under one display
-- name, which the Up allows on purpose -- and that is the right outcome: those
-- rows are legitimate, re-keying on name would silently merge two products
-- into one, and failing on the first statement leaves the whole schema as it
-- was.
ALTER TABLE "license"
  ADD CONSTRAINT "license_name_version_organization_id_key" UNIQUE ("name", "version", "organization_id");

DROP TRIGGER "instance_license_not_archived_update_trigger" ON "instance";
DROP TRIGGER "instance_license_not_archived_insert_trigger" ON "instance";
DROP FUNCTION instance_license_not_archived();

DROP INDEX "idx_license_family_org_created_at";
ALTER TABLE "license" DROP CONSTRAINT "license_default_must_be_published_check";
ALTER TABLE "license" DROP COLUMN "lifecycle_state";
DROP TYPE "license_lifecycle_state";

-- Restores the (name, organization_id) keying of 20260816020000 verbatim.
CREATE OR REPLACE FUNCTION update_license_version()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended(NEW."organization_id"::text || ':' || NEW.name, 0));
SELECT COALESCE(MAX(version) + 1, 1)
INTO NEW.version
FROM public."license"
WHERE name = NEW.name
  AND "organization_id" = NEW."organization_id";
NEW."version_name" := COALESCE(NEW."version_name", CONCAT('Version - ', NEW.version));
RETURN NEW;
END;
$$;

ALTER TABLE "license" DROP CONSTRAINT "license_family_id_version_key";
DROP INDEX "license_family_id_is_default_key";
ALTER TABLE "license" DROP CONSTRAINT "license_family_id_fkey";
ALTER TABLE "license" DROP COLUMN "family_id";
DROP TABLE "license_family";

-- Three things do not come back. Which versions were drafts or archived: the
-- column is gone and nothing else recorded it. The is_default flags the Up
-- switched off: which family they belonged to is derivable from name again,
-- but which of them used to be on is not. And a family that a rename split or
-- merged while this migration was applied stays as the rename left it: once
-- name is the key again, the grouping is whatever name says it is.
-- +goose StatementEnd
