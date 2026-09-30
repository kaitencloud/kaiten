-- +goose Up
-- +goose StatementBegin
-- native periodic usage windows for NUMBER-family entitlements.
-- reset_period/reset_anchor belong to the catalogue entitlement (measurement
-- semantics), not the contract/grant (enforcement policy). NULL reset_period
-- means "lifetime counter", preserving current behavior for every existing
-- entitlement and every entitlement created without opting in. reset_anchor
-- is required exactly when reset_period is set. Periodic reset follows the
-- same NUMBER-family gate as aggregation_method (NUMBER, NUMBER_AI_CREDIT)
-- and is incompatible with aggregation_method = LATEST, since a "most
-- recent value" has no meaningful per-window reset. entitlement_usage's new
-- period_start is nullable and additive: existing rows stay NULL and keep
-- being read as lifetime counters; window rollover is evaluated lazily on
-- reads/reports, not backfilled here.
CREATE TYPE "entitlement_reset_period" AS ENUM ('HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR');
CREATE TYPE "entitlement_reset_anchor" AS ENUM ('CALENDAR', 'LICENSE_START');

ALTER TABLE "entitlement" ADD COLUMN "reset_period" "entitlement_reset_period";
ALTER TABLE "entitlement" ADD COLUMN "reset_anchor" "entitlement_reset_anchor";

ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_reset_anchor_required_check" CHECK (
  ("reset_period" IS NULL AND "reset_anchor" IS NULL)
    OR
  ("reset_period" IS NOT NULL AND "reset_anchor" IS NOT NULL)
  );

ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_reset_period_number_family_check" CHECK (
  "reset_period" IS NULL
    OR
  "type" IN ('NUMBER', 'NUMBER_AI_CREDIT')
  );

ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_reset_period_latest_check" CHECK (
  "reset_period" IS NULL
    OR
  "aggregation_method" IS DISTINCT FROM 'LATEST'
  );

ALTER TABLE "entitlement_usage" ADD COLUMN "period_start" TIMESTAMP(3);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "entitlement_usage" DROP COLUMN "period_start";

ALTER TABLE "entitlement" DROP CONSTRAINT "entitlement_reset_period_latest_check";
ALTER TABLE "entitlement" DROP CONSTRAINT "entitlement_reset_period_number_family_check";
ALTER TABLE "entitlement" DROP CONSTRAINT "entitlement_reset_anchor_required_check";

ALTER TABLE "entitlement" DROP COLUMN "reset_anchor";
ALTER TABLE "entitlement" DROP COLUMN "reset_period";

DROP TYPE "entitlement_reset_anchor";
DROP TYPE "entitlement_reset_period";
-- +goose StatementEnd
