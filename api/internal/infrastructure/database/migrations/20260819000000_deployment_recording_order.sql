-- +goose Up
-- +goose StatementBegin
-- Every "newest first" read of the deployment log orders by
-- created_at DESC, id DESC. created_at is TIMESTAMP(3), so two events
-- recorded in the same millisecond tie -- sequential inserts land in the
-- same millisecond most of the time on an idle box, and two inserts in one
-- transaction share CURRENT_TIMESTAMP exactly. On a tie the id tie-break
-- decides, and id is a random UUIDv4: which of the tied events is "the
-- zone's current release" is a coin flip (measured ~50% wrong on forced
-- ties), which is how a zone deployed to twice in quick succession can
-- report the older release as current.
--
-- seq is the log's recording order: drawn from a sequence at insert time,
-- monotonic across connections and within a transaction. created_at stays
-- the user-facing timestamp and primary sort key; seq replaces id as the
-- tie-break, so among events stamped in the same millisecond the one
-- recorded last wins.
--
-- Existing rows are backfilled in table order, not created_at order. The
-- difference only matters for rows already tied on created_at, where the
-- order was arbitrary anyway; the true recording order of those events is
-- not recoverable.
ALTER TABLE "deployment" ADD COLUMN "seq" BIGINT NOT NULL GENERATED ALWAYS AS IDENTITY;

-- Same two read paths as before, now covering the full sort key.
DROP INDEX "idx_deployment_zone_created_at";
DROP INDEX "idx_deployment_release_created_at";
CREATE INDEX "idx_deployment_zone_created_at_seq"
  ON "deployment" ("organization_id", "deployment_zone_id", "created_at" DESC, "seq" DESC);
CREATE INDEX "idx_deployment_release_created_at_seq"
  ON "deployment" ("organization_id", "release_id", "created_at" DESC, "seq" DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX "idx_deployment_zone_created_at_seq";
DROP INDEX "idx_deployment_release_created_at_seq";
CREATE INDEX "idx_deployment_zone_created_at"
  ON "deployment" ("organization_id", "deployment_zone_id", "created_at" DESC);
CREATE INDEX "idx_deployment_release_created_at"
  ON "deployment" ("organization_id", "release_id", "created_at" DESC);

ALTER TABLE "deployment" DROP COLUMN "seq";
-- +goose StatementEnd
