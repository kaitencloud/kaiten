-- +goose Up
-- +goose StatementBegin
-- deployment.release_id is NOT NULL and half of deployment_pkey, so the
-- original ON DELETE SET NULL could never actually fire: the cascade would
-- have to write NULL into a NOT NULL primary-key column, aborting the delete
-- with an opaque not-null violation instead of the intended detach. The two
-- halves of the declaration contradict each other and the column wins.
--
-- RESTRICT states the rule the primary key already implies -- a release that
-- is deployed to a zone cannot be deleted -- and raises 23503, which
-- deleterelease maps to 409. This matches component_release, the other table
-- that references release from a composite primary key.
ALTER TABLE "deployment" DROP CONSTRAINT "deployment_release_fkey";
ALTER TABLE "deployment"
  ADD CONSTRAINT "deployment_release_fkey" FOREIGN KEY ("release_id") REFERENCES "release" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "deployment" DROP CONSTRAINT "deployment_release_fkey";
ALTER TABLE "deployment"
  ADD CONSTRAINT "deployment_release_fkey" FOREIGN KEY ("release_id") REFERENCES "release" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- +goose StatementEnd
