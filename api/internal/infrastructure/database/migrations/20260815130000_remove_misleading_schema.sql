-- +goose Up
-- +goose StatementBegin
-- drop the columns that describe behaviour the code does not have,
-- and close the audit columns that look like foreign keys but are not.
--
-- instance.deleted_at: no statement in the repository has ever written it.
-- DeleteInstance is a real DELETE (see queries/instance.sql), so the column
-- was permanently NULL and the whole surface built on it -- the
-- GetAllInstancesWithDeleted* queries, the ?include_deleted query parameter,
-- the GraphQL includeDeleted argument and the deletedAt response field --
-- promised a trash that does not exist.
--
-- entitlement.event_name: NOT NULL, and both the create and the update
-- repository wrote "" with a "what do we need to do with this field?" TODO.
-- Never read, never reached a DTO. Whichever entity ends up carrying "which
-- business event feeds this counter" should be designed then, not squatted
-- on now by a column that only ever holds the empty string.
--
-- license.is_active: copied into the REST and GraphQL DTOs and documented as
-- "whether the license is currently active and can be used", but no query
-- filters on it and POST /instances requires an explicit licenseId, so an
-- inactive license was usable exactly like an active one.
ALTER TABLE "instance" DROP COLUMN "deleted_at";
ALTER TABLE "entitlement" DROP COLUMN "event_name";
ALTER TABLE "license" DROP COLUMN "is_active";

-- Six audit columns referenced "user" without a foreign key while every
-- column of the same role elsewhere is constrained (customer, instance and
-- metadata_field all declare both sides). release was the clearest tell: it
-- declares release_created_by_fkey but never declared the updated_by
-- counterpart. Reads INNER JOIN "user" on these columns, so a dangling id
-- silently drops the row from the list instead of raising.
--
-- ON DELETE follows the nullability, matching the existing convention:
-- NOT NULL audit columns RESTRICT (like instance_created_by_id_fkey), the
-- one nullable column SET NULLs (like token_revoked_by_fkey).
ALTER TABLE "user"
  ADD CONSTRAINT "user_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deployment_zone"
  ADD CONSTRAINT "deployment_zone_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deployment_zone"
  ADD CONSTRAINT "deployment_zone_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "release"
  ADD CONSTRAINT "release_updated_by_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "license_entitlement"
  ADD CONSTRAINT "license_entitlement_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "license_entitlement"
  ADD CONSTRAINT "license_entitlement_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- user.organization_id is the one denormalised column in this batch that
-- stays. No application query reads it -- machine-account membership is
-- resolved through user_on_organization everywhere -- but dropping it would
-- take idx_unique_machine_slug_per_org with it, and that partial unique index
-- is the only thing keeping two machine accounts in one organization from
-- claiming the same slug. Record why, so the next reader does not repeat the
-- "written and never read, therefore droppable" reasoning.
COMMENT ON COLUMN "user"."organization_id" IS
  'Machine accounts only (see user_organization_id_machine_check). Not read by any application query - membership is resolved via user_on_organization. Kept because idx_unique_machine_slug_per_org depends on it for per-organization slug uniqueness.';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
COMMENT ON COLUMN "user"."organization_id" IS NULL;

ALTER TABLE "license_entitlement" DROP CONSTRAINT "license_entitlement_updated_by_id_fkey";
ALTER TABLE "license_entitlement" DROP CONSTRAINT "license_entitlement_created_by_id_fkey";
ALTER TABLE "release" DROP CONSTRAINT "release_updated_by_fkey";
ALTER TABLE "deployment_zone" DROP CONSTRAINT "deployment_zone_updated_by_id_fkey";
ALTER TABLE "deployment_zone" DROP CONSTRAINT "deployment_zone_created_by_id_fkey";
ALTER TABLE "user" DROP CONSTRAINT "user_created_by_id_fkey";

-- The defaults exist only to backfill the rows that outlived the Up; the
-- originals declared neither, so they are dropped again straight away.
ALTER TABLE "license" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "license" ALTER COLUMN "is_active" DROP DEFAULT;
ALTER TABLE "entitlement" ADD COLUMN "event_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "entitlement" ALTER COLUMN "event_name" DROP DEFAULT;
ALTER TABLE "instance" ADD COLUMN "deleted_at" TIMESTAMP(3);
-- +goose StatementEnd
