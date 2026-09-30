-- +goose Up
-- +goose StatementBegin
-- a release is immutable. There is no PUT or PATCH on /releases, no
-- statement that writes to the table after the INSERT, and no way to attach
-- or detach a component afterwards -- createrelease takes the component list
-- and that is the only place component_release is written. release.updated_at
-- and release.updated_by_id were therefore permanently equal to created_at
-- and created_by_id, and the Release DTO published them as "last updated",
-- which is a promise of an update path that does not exist.
--
-- They go rather than get annotated. The endpoint descriptions state the
-- immutability instead.
ALTER TABLE "release" DROP CONSTRAINT "release_updated_by_fkey";
ALTER TABLE "release"
  DROP COLUMN "updated_at",
  DROP COLUMN "updated_by_id";

-- deployment was keyed on (deployment_zone_id, release_id), so a
-- given release could be recorded against a given zone exactly once, ever.
-- Re-pointing a zone at a release it already ran -- a rollback, which is an
-- ordinary operational event -- came back as
-- 409 CreateDeployment.AlreadyDeployed from PUT /deployment-zones/{slug},
-- an error the caller could neither have caused nor resolve.
--
-- The row already carries created_at and created_by_id, the GraphQL schema
-- already calls it "a historical deployment event" and exposes
-- Release.deployments as "historical deployment records", and
-- GetDeploymentZonesByReleaseIDs already reads DISTINCT ON to tolerate
-- repeats. Everything except the primary key was already describing an
-- append-only log; the key is what made it a set. A surrogate id makes the
-- table what the contract says it is.
--
-- Existing rows are unaffected: one row per pair is a valid history, it just
-- stops being the only permitted one.
ALTER TABLE "deployment" DROP CONSTRAINT "deployment_pkey";
ALTER TABLE "deployment" ADD COLUMN "id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_pkey" PRIMARY KEY ("id");

-- Both reads of the log are "the deployments of X, newest first": by zone for
-- a zone's history, by release for Release.deployments and
-- Release.deploymentZones. The composite primary key used to serve them.
CREATE INDEX "idx_deployment_zone_created_at"
  ON "deployment" ("organization_id", "deployment_zone_id", "created_at" DESC);
CREATE INDEX "idx_deployment_release_created_at"
  ON "deployment" ("organization_id", "release_id", "created_at" DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Collapsing the log back to a set loses every deployment of a pair but its
-- most recent one -- the rollbacks the Up migration exists to allow.
DELETE FROM "deployment" d
USING "deployment" newer
WHERE d.deployment_zone_id = newer.deployment_zone_id
  AND d.release_id = newer.release_id
  AND (newer.created_at, newer.id) > (d.created_at, d.id);

DROP INDEX "idx_deployment_release_created_at";
DROP INDEX "idx_deployment_zone_created_at";

ALTER TABLE "deployment" DROP CONSTRAINT "deployment_pkey";
ALTER TABLE "deployment" DROP COLUMN "id";
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_pkey" PRIMARY KEY ("deployment_zone_id", "release_id");

ALTER TABLE "release"
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_by_id" UUID;
UPDATE "release" SET "updated_at" = "created_at", "updated_by_id" = "created_by_id";
ALTER TABLE "release" ALTER COLUMN "updated_by_id" SET NOT NULL;
ALTER TABLE "release"
  ADD CONSTRAINT "release_updated_by_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- +goose StatementEnd
