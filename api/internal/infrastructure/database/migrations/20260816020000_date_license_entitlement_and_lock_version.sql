-- +goose Up
-- +goose StatementBegin
-- license and entitlement -- the contract and the definition it is
-- built from -- were the only two organization-scoped business tables with
-- no timestamps at all, while every neighbouring table (customer, instance,
-- license_entitlement, release, ...) has carried created_at/updated_at
-- since the initial schema.
--
-- Since cursor pagination landed that gap is load-bearing rather
-- than cosmetic. Both tables are keyset-paginated, and with no timestamp
-- column the only usable cursor was the primary key -- a gen_random_uuid()
-- v4, not a v7/ULID. That gives a stable total order (no row skipped or
-- repeated across pages) but an arbitrary one: "the newest licenses" was
-- not expressible, and neither was dating a commercial incident.
--
-- Existing rows are backfilled by the column DEFAULT, which Postgres
-- applies to every already-present row when a NOT NULL column with a
-- default is added. They all land on the migration instant: their real
-- creation time was never recorded anywhere and cannot be recovered, so
-- the ordering only carries information for rows written from here on.
ALTER TABLE "license"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "entitlement"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The keyset reads (organization_id, created_at DESC, id DESC), which is
-- exactly this index: one range scan per page instead of sorting the
-- organization's whole catalogue. Ordering by the primary key alone could
-- lean on license_pkey/entitlement_pkey, so without these the switch to a
-- chronological cursor would trade an arbitrary order for a sort.
CREATE INDEX "idx_license_org_created_at"
  ON "license" ("organization_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_entitlement_org_created_at"
  ON "entitlement" ("organization_id", "created_at" DESC, "id" DESC);

-- update_license_version() computed MAX(version) + 1 with nothing
-- serializing it. Two concurrent POSTs for the same (organization, name)
-- family both read the same maximum, both wrote the same version, and
-- license_name_version_organization_id_key turned the race into a 409 for
-- whichever transaction committed second -- a conflict the caller neither
-- caused nor can resolve, since retrying sends the same body.
--
-- A transaction-scoped advisory lock keyed on the family serializes only
-- the inserts that actually contend: two families, or two organizations,
-- never wait on each other. Being transaction-scoped it is held to commit,
-- which is what makes the MAX() the second insert reads include the first
-- one's row (each statement takes a fresh snapshot under READ COMMITTED,
-- the level every write path here runs at). hashtextextended collapses the
-- key to the bigint the advisory-lock API takes; ':' delimits the two parts
-- so a family cannot be confused with another organization's, organization_id
-- being a UUID whose text form contains no colon.
--
-- The second SELECT is gone with it. It recomputed MAX(version) + 1 a
-- second time purely to build the default version_name, so a row inserted
-- between the two statements could label version 2 as "Version - 3".
-- NEW.version, just assigned, is the only source now.
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

-- license.version was declared SERIAL, so every insert drew a value from
-- license_version_seq during tuple construction and the BEFORE INSERT
-- trigger overwrote it before the row was ever written. The sequence has
-- never been read by anything; it only burned a value per insert and
-- suggested a numbering the trigger does not use. The column keeps its
-- INTEGER NOT NULL declaration -- the trigger always assigns it.
ALTER TABLE "license" ALTER COLUMN "version" DROP DEFAULT;
DROP SEQUENCE "license_version_seq";

-- The constraint was named for the wrong table entirely. It is
-- UNIQUE (version, organization_id) on release -- "one release version per
-- organization" -- and has nothing to do with component, which carries its
-- own component_name_version_unique. The name is the only thing that
-- changes; the guarantee is unchanged. Mirrors that component constraint's
-- naming rather than release_organization_id_slug_key's, because these two
-- are the pair a reader is trying to tell apart.
ALTER TABLE "release" RENAME CONSTRAINT "component_version_unique" TO "release_version_unique";
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "release" RENAME CONSTRAINT "release_version_unique" TO "component_version_unique";

CREATE SEQUENCE "license_version_seq" AS integer OWNED BY "license"."version";
SELECT setval('license_version_seq', GREATEST((SELECT COALESCE(MAX("version"), 1) FROM "license"), 1), true);
ALTER TABLE "license" ALTER COLUMN "version" SET DEFAULT nextval('license_version_seq'::regclass);

CREATE OR REPLACE FUNCTION update_license_version()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
BEGIN
SELECT COALESCE(MAX(version) + 1, 1)
INTO NEW.version
FROM public."license"
WHERE name = NEW.name
  AND "organization_id" = NEW."organization_id";
SELECT COALESCE(NEW."version_name", CONCAT('Version - ', COALESCE(MAX(version) + 1, 1)))
INTO NEW."version_name"
FROM public."license"
WHERE name = NEW.name
  AND "organization_id" = NEW."organization_id";
RETURN NEW;
END;
$$;

DROP INDEX "idx_entitlement_org_created_at";
DROP INDEX "idx_license_org_created_at";

ALTER TABLE "entitlement"
  DROP COLUMN "updated_at",
  DROP COLUMN "created_at";

ALTER TABLE "license"
  DROP COLUMN "updated_at",
  DROP COLUMN "created_at";
-- +goose StatementEnd
