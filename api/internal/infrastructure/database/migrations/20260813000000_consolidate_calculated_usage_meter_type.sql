-- +goose Up
-- +goose StatementBegin
-- consolidate CALCULATED_USAGE and RAW_EVENT into a single meter
-- type. The only real behavioral difference between the two was whether a
-- reported value folded into the stored total via a configurable
-- aggregation_method or was hard-summed — and CALCULATED_USAGE's append
-- behavior was already byte-for-byte identical to RAW_EVENT's SUM
-- aggregation. Every NUMBER-family entitlement (NUMBER, NUMBER_AI_CREDIT)
-- now always carries an aggregation_method (SUM by default, preserving the
-- old CALCULATED_USAGE behavior); meter_type no longer exists. The backfill
-- runs before the column drop so no RAW_EVENT/aggregation_method pairing is
-- lost, and before the replacement CHECK constraint so no pre-existing
-- CALCULATED_USAGE row (which previously allowed a null aggregation_method)
-- violates it.
UPDATE "entitlement"
SET "aggregation_method" = 'SUM'
WHERE "type" IN ('NUMBER', 'NUMBER_AI_CREDIT')
  AND "meter_type" = 'CALCULATED_USAGE'
  AND "aggregation_method" IS NULL;

ALTER TABLE "entitlement" DROP CONSTRAINT "entitlement_number_meter_check";
ALTER TABLE "entitlement" DROP CONSTRAINT "entitlement_aggregation_method_check";
ALTER TABLE "entitlement" DROP COLUMN "meter_type";
DROP TYPE "meter_type";

ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_number_aggregation_check" CHECK (
  ("type" IN ('NUMBER', 'NUMBER_AI_CREDIT') AND "aggregation_method" IN ('COUNT', 'SUM', 'AVERAGE', 'MAX', 'MIN', 'LATEST'))
    OR
  ("type" IN ('BOOLEAN', 'CONFIG') AND "aggregation_method" IS NULL)
  );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
CREATE TYPE "meter_type" AS ENUM ('CALCULATED_USAGE', 'RAW_EVENT');

ALTER TABLE "entitlement" DROP CONSTRAINT "entitlement_number_aggregation_check";
ALTER TABLE "entitlement" ADD COLUMN "meter_type" "meter_type";

UPDATE "entitlement"
SET "meter_type" = 'CALCULATED_USAGE'
WHERE "type" IN ('NUMBER', 'NUMBER_AI_CREDIT');

ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_number_meter_check" CHECK (
  ("type" IN ('NUMBER', 'NUMBER_AI_CREDIT') AND "meter_type" IN ('CALCULATED_USAGE', 'RAW_EVENT'))
    OR
  ("type" IN ('BOOLEAN', 'CONFIG') AND "meter_type" IS NULL)
  );
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_aggregation_method_check" CHECK (
  ("type" IN ('NUMBER', 'NUMBER_AI_CREDIT') AND "meter_type" = 'RAW_EVENT' AND "aggregation_method" IN ('COUNT', 'SUM', 'AVERAGE', 'MAX', 'MIN', 'LATEST'))
    OR
  ("type" IN ('NUMBER', 'NUMBER_AI_CREDIT') AND "meter_type" = 'CALCULATED_USAGE')
    OR
  ("type" IN ('BOOLEAN', 'CONFIG') AND "aggregation_method" IS NULL)
  );
-- +goose StatementEnd
