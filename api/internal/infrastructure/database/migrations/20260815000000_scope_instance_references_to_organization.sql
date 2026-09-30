-- +goose Up
-- +goose StatementBegin
-- An instance could reference another tenant's customer or license.
-- CreateInstance/EditInstance take customer_id and license_id as opaque
-- UUIDs and only constrain the ACTOR through user_on_organization, so a
-- caller with write:instances could attach its instance to a foreign
-- customer or license. Nothing else could catch it either: both foreign
-- keys were single-column, so the database happily accepted a row whose
-- organization_id disagreed with the referenced row's.
--
-- Widening the two foreign keys to (id, organization_id) moves the
-- invariant into the schema, where every write path inherits it instead of
-- each query having to remember an EXISTS clause. The referenced tables
-- need a matching unique key for that: (id) is already the primary key, so
-- (id, organization_id) is trivially unique and the added constraints
-- cannot fail on existing data.
--
-- The constraint names and referential actions are preserved verbatim, so
-- createinstance/repository.go keeps mapping instance_customer_id_fkey and
-- instance_license_id_fkey to their 404s -- a foreign UUID now lands there
-- rather than silently succeeding.
--
-- deployment_zone_id is deliberately left alone: it is nullable and out of
-- this fix's scope, which covers customer and license only.
ALTER TABLE "customer"
  ADD CONSTRAINT "customer_id_organization_id_key" UNIQUE ("id", "organization_id");

ALTER TABLE "license"
  ADD CONSTRAINT "license_id_organization_id_key" UNIQUE ("id", "organization_id");

ALTER TABLE "instance" DROP CONSTRAINT "instance_customer_id_fkey";
ALTER TABLE "instance"
  ADD CONSTRAINT "instance_customer_id_fkey"
    FOREIGN KEY ("customer_id", "organization_id")
    REFERENCES "customer" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "instance" DROP CONSTRAINT "instance_license_id_fkey";
ALTER TABLE "instance"
  ADD CONSTRAINT "instance_license_id_fkey"
    FOREIGN KEY ("license_id", "organization_id")
    REFERENCES "license" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "instance" DROP CONSTRAINT "instance_license_id_fkey";
ALTER TABLE "instance"
  ADD CONSTRAINT "instance_license_id_fkey"
    FOREIGN KEY ("license_id")
    REFERENCES "license" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "instance" DROP CONSTRAINT "instance_customer_id_fkey";
ALTER TABLE "instance"
  ADD CONSTRAINT "instance_customer_id_fkey"
    FOREIGN KEY ("customer_id")
    REFERENCES "customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "license" DROP CONSTRAINT "license_id_organization_id_key";
ALTER TABLE "customer" DROP CONSTRAINT "customer_id_organization_id_key";
-- +goose StatementEnd
