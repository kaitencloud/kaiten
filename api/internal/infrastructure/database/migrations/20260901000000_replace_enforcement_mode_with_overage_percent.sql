-- +goose Up
-- +goose StatementBegin
-- Entitlement enforcement was an org-wide policy on the catalogue
-- entitlement (enforcement_mode: HARD rejects any usage past the cap, SOFT
-- accepts an unbounded overage) with no way to bound how much overage a
-- SOFT grant actually permits, and no way for two licenses on the same
-- entitlement to carry different enforcement -- one customer's "unlimited"
-- and another's "hard-capped" tier for the same entitlement could never
-- coexist. Both problems trace to the same cause: enforcement lived beside
-- the catalogue definition instead of beside the number it enforces.
--
-- limit_cap_exceeded_overage_percent replaces it, moved onto the
-- contract/grant (license_entitlement, next to value -- the same distinction
-- reset_period/reset_anchor documented for the catalogue side) so it can be
-- validated against, and vary with, that grant's own numeric value:
--   -1  => value is the unlimited sentinel (-1); no cap, so no overage
--   0   => hard limit: usage above value is rejected
--   >0  => soft limit: usage may exceed value by up to this percent before
--          being rejected (previously unbounded under SOFT)
-- Only meaningful for a NUMBER-shaped value, so it is NULL for boolean/object
-- grants, mirroring how aggregation_method is NULL for non-NUMBER-family
-- entitlement rows.
--
-- Backfill: the unlimited sentinel maps to -1 regardless of the old
-- enforcement_mode (unlimited already ignored it at report time). A
-- previously HARD number grant maps to 0, its exact equivalent. A
-- previously SOFT number grant has no faithful equivalent -- SOFT was
-- unbounded and this column always bounds -- so it maps to 100 (double the
-- grant before rejecting) as a reviewable, conservative stand-in rather
-- than silently reproducing unbounded overage or silently hard-capping it.
ALTER TABLE "license_entitlement" ADD COLUMN "limit_cap_exceeded_overage_percent" SMALLINT;

UPDATE "license_entitlement" le
SET "limit_cap_exceeded_overage_percent" = CASE
  WHEN (le."value" ->> 'value')::numeric = -1 THEN -1
  WHEN e."enforcement_mode" = 'SOFT' THEN 100
  ELSE 0
  END
FROM "entitlement" e
WHERE e."id" = le."entitlement_id"
  AND le."value" ->> 'type' = 'number';

ALTER TABLE "license_entitlement" ADD CONSTRAINT "license_entitlement_overage_percent_number_only_check" CHECK (
  ("value" ->> 'type' = 'number' AND "limit_cap_exceeded_overage_percent" IS NOT NULL)
    OR
  ("value" ->> 'type' <> 'number' AND "limit_cap_exceeded_overage_percent" IS NULL)
  );

ALTER TABLE "license_entitlement" ADD CONSTRAINT "license_entitlement_overage_percent_unlimited_check" CHECK (
  "limit_cap_exceeded_overage_percent" IS NULL
    OR
  (("value" ->> 'value')::numeric = -1 AND "limit_cap_exceeded_overage_percent" = -1)
    OR
  (("value" ->> 'value')::numeric <> -1 AND "limit_cap_exceeded_overage_percent" >= 0)
  );

ALTER TABLE "entitlement" DROP CONSTRAINT "entitlement_ai_credit_enforcement_check";
ALTER TABLE "entitlement" DROP COLUMN "enforcement_mode";
DROP TYPE "entitlement_enforcement_mode";
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
CREATE TYPE "entitlement_enforcement_mode" AS ENUM ('HARD', 'SOFT');

ALTER TABLE "entitlement" ADD COLUMN "enforcement_mode" "entitlement_enforcement_mode" NOT NULL DEFAULT 'HARD';
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_ai_credit_enforcement_check" CHECK (
  "type" <> 'NUMBER_AI_CREDIT' OR "enforcement_mode" = 'SOFT'
  );

-- Lossy, like the rest of this Down: a SOFT-mapped 100 and a genuinely
-- configured 100 are indistinguishable by now, so every non-hard, non-unlimited
-- grant maps back to SOFT and everything else to HARD -- not a reconstruction
-- of the pre-migration value.
UPDATE "entitlement" e
SET "enforcement_mode" = 'SOFT'
FROM "license_entitlement" le
WHERE le."entitlement_id" = e."id"
  AND le."limit_cap_exceeded_overage_percent" > 0;

ALTER TABLE "license_entitlement" DROP CONSTRAINT "license_entitlement_overage_percent_unlimited_check";
ALTER TABLE "license_entitlement" DROP CONSTRAINT "license_entitlement_overage_percent_number_only_check";
ALTER TABLE "license_entitlement" DROP COLUMN "limit_cap_exceeded_overage_percent";
-- +goose StatementEnd
