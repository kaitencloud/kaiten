-- +goose Up
-- +goose StatementBegin
-- A service account is now deleted through the API (deleteserviceaccount), and
-- deleted the way a human user is: deleted_at is set and the row stays, because
-- it is the created_by_id/updated_by_id target of every row it authored, ON
-- DELETE RESTRICT (see 20260816030000_hard_delete_organization.sql).
--
-- A deleted account must give its slug back, or an organization could never
-- create an account under the name of one it removed: the partial unique index
-- that keeps two machine accounts of one organization from sharing a slug only
-- counts the live ones from here on. Same name, so the constraint the create
-- maps to CreateServiceAccount.SlugConflict is unchanged.
--
-- idx_unique_orgless_machine_slug stays as it is: the only orgless machine row
-- is system:kaiten, which a trigger refuses to delete.
DROP INDEX "idx_unique_machine_slug_per_org";
CREATE UNIQUE INDEX "idx_unique_machine_slug_per_org"
  ON "user" ("slug", "organization_id")
  WHERE "type" = 'machine' AND "deleted_at" IS NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Fails if a deleted account and a live one of the same organization share a
-- slug: the full index cannot hold both. Rename one of them first.
DROP INDEX "idx_unique_machine_slug_per_org";
CREATE UNIQUE INDEX "idx_unique_machine_slug_per_org"
  ON "user" ("slug", "organization_id")
  WHERE "type" = 'machine';
-- +goose StatementEnd
