-- +goose Up
-- +goose StatementBegin
-- The third instance reference that needs the same fix. CreateInstance/EditInstance take
-- deployment_zone_id as an opaque UUID and only constrain the ACTOR through
-- user_on_organization, so a caller with write:instances could attach its
-- instance to another tenant's deployment zone. Nothing else could catch it
-- either: instance_deployment_zone_id_fkey was single-column, so the database
-- happily accepted a row whose organization_id disagreed with the referenced
-- zone's.
--
-- 20260815000000 widened instance's customer and license foreign keys to
-- (id, organization_id) and explicitly deferred this one. Same treatment:
-- deployment_zone gains the matching (id, organization_id) unique key -- (id)
-- is already the primary key, so it is trivially unique and cannot fail on
-- existing data -- and the foreign key widens to match, which puts the
-- invariant in the schema where every write path inherits it.
--
-- Two details are preserved verbatim so behaviour outside the cross-tenant
-- case is unchanged:
--
--   * The constraint name. createinstance/repository.go already maps
--     instance_deployment_zone_id_fkey to a 404 and updateinstance/repository.go
--     now does too, so a foreign zone UUID lands on the same "not found" a
--     nonexistent one already produced -- which is what stops the response
--     being a cross-tenant existence oracle.
--
--   * The referential action, via the column list on SET NULL. A bare
--     ON DELETE SET NULL over a composite key nulls EVERY referencing column,
--     and instance.organization_id is NOT NULL -- deleting a zone that still
--     had instances would abort with a not-null violation instead of detaching
--     them, the same contradiction 20260815120000 removed from
--     deployment_release_fkey. Naming the column keeps the cascade writing
--     only deployment_zone_id, exactly as before.
--
-- deployment_zone_id stays nullable, and the default MATCH SIMPLE means a row
-- with no zone skips the check entirely, so unzoned instances are unaffected.
ALTER TABLE "deployment_zone"
  ADD CONSTRAINT "deployment_zone_id_organization_id_key" UNIQUE ("id", "organization_id");

ALTER TABLE "instance" DROP CONSTRAINT "instance_deployment_zone_id_fkey";
ALTER TABLE "instance"
  ADD CONSTRAINT "instance_deployment_zone_id_fkey"
    FOREIGN KEY ("deployment_zone_id", "organization_id")
    REFERENCES "deployment_zone" ("id", "organization_id")
    ON DELETE SET NULL ("deployment_zone_id") ON UPDATE CASCADE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "instance" DROP CONSTRAINT "instance_deployment_zone_id_fkey";
ALTER TABLE "instance"
  ADD CONSTRAINT "instance_deployment_zone_id_fkey"
    FOREIGN KEY ("deployment_zone_id")
    REFERENCES "deployment_zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deployment_zone" DROP CONSTRAINT "deployment_zone_id_organization_id_key";
-- +goose StatementEnd
