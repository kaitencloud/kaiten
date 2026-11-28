-- +goose Up
-- +goose StatementBegin
-- Combined entitlements: a NUMBER entitlement whose usage is the weighted sum of
-- other entitlements' usage, computed when it is read. Nothing is stored for the
-- sum: no entitlement_usage row, no ledger row, no licence grant.
--
-- usage_source says where a NUMBER-family entitlement's usage comes from. It is
-- meaningful for that family only, and the API reports it only there. It is NOT
-- NULL with a default, so every writer that inserts an entitlement without it
-- (the API's create included) keeps working: CALCULATED_USAGE is every row that
-- exists today. This is the ADR's "set on every existing NUMBER-family row",
-- also set on BOOLEAN and CONFIG rows, which never expose it. The meter_type
-- enum dropped in 20260813000000 had a member of the same name; its type is
-- gone, this one is a new one.
CREATE TYPE "entitlement_usage_source" AS ENUM ('CALCULATED_USAGE', 'COMBINED_USAGE');

ALTER TABLE "entitlement"
  ADD COLUMN "usage_source" "entitlement_usage_source" NOT NULL DEFAULT 'CALCULATED_USAGE';

-- A combined entitlement is a NUMBER summed: the API sets SUM when omitted and
-- refuses any other value, and a credit pool is always calculated. IS NOT
-- DISTINCT FROM so that a NULL aggregation fails the check instead of passing it.
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_combined_usage_check" CHECK (
  "usage_source" <> 'COMBINED_USAGE'
    OR ("type" = 'NUMBER' AND "aggregation_method" IS NOT DISTINCT FROM 'SUM')
  );

-- One row per (combined entitlement, source). What a source may be (type,
-- aggregation, one shared window) is checked by the use case under a row lock;
-- the composite foreign keys keep both sides in the organization's own rows.
--
-- BOTH keys cascade. A RESTRICT or NO ACTION key on the source side would fail
-- DELETE organization: its cascades run row by row, and a source is stored, so
-- deleted, before the combined entitlement that names it. Deleting a source
-- that is still used is refused by the delete use case instead
-- (DeleteEntitlement.InUseConflict), under the source's row lock.
--
-- weight mirrors the AI conversion rates: an exact decimal, 8 integer digits and
-- 10 decimals, strictly positive.
CREATE TABLE "entitlement_source"
(
  "organization_id"         UUID            NOT NULL,
  "combined_entitlement_id" UUID            NOT NULL,
  "source_entitlement_id"   UUID            NOT NULL,
  "weight"                  NUMERIC(18, 10) NOT NULL DEFAULT 1,

  CONSTRAINT "entitlement_source_pkey" PRIMARY KEY ("combined_entitlement_id", "source_entitlement_id"),
  CONSTRAINT "entitlement_source_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entitlement_source_combined_fkey" FOREIGN KEY ("combined_entitlement_id", "organization_id")
    REFERENCES "entitlement" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entitlement_source_source_fkey" FOREIGN KEY ("source_entitlement_id", "organization_id")
    REFERENCES "entitlement" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entitlement_source_weight_check" CHECK ("weight" > 0),
  CONSTRAINT "entitlement_source_distinct_check" CHECK ("combined_entitlement_id" <> "source_entitlement_id")
);

-- The source side: "is this entitlement a source?" on every delete and on every
-- adoption of a reset period.
CREATE INDEX "idx_entitlement_source_source" ON "entitlement_source" ("source_entitlement_id");
-- The organization's definitions, read on every usage list.
CREATE INDEX "idx_entitlement_source_org" ON "entitlement_source" ("organization_id", "combined_entitlement_id");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "entitlement" WHERE "usage_source" = 'COMBINED_USAGE') THEN
    RAISE EXCEPTION 'entitlement has COMBINED_USAGE rows; delete them before rolling back 20261128100000';
  END IF;
END
$$;
DROP TABLE "entitlement_source";
ALTER TABLE "entitlement" DROP CONSTRAINT "entitlement_combined_usage_check";
ALTER TABLE "entitlement" DROP COLUMN "usage_source";
DROP TYPE "entitlement_usage_source";
-- +goose StatementEnd
