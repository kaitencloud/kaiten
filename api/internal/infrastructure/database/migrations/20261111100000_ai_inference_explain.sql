-- +goose Up
-- +goose StatementBegin
-- Explainable AI charges: what an ai_inference row needs to say why it was
-- charged what it was, without reading a rule or a model that may have
-- changed since.
--
-- pricing is the snapshot of the conversion rule that priced the operation
-- (rule id, specificity, rates, clamps, charge-on-error policy), written with
-- the estimate at reserve and overwritten at commit; NULL when no rule
-- applied. license_id is the licence whose rules were considered. warnings
-- are the ones the phase that closed the row answered with. report_seq is the
-- pair's report counter of the commit that charged, the link to the usage
-- journal; NULL when nothing was counted. The vendor costs are in USD, the
-- catalogue's cost currency: reported by the caller, and computed from the
-- model's catalogue costs.
--
-- Like every other reference on this table, license_id carries no foreign
-- key: the record outlives the licence. Additive, and every column is NULL
-- (or empty) on the rows written before this migration.
ALTER TABLE "ai_inference"
  ADD COLUMN "pricing"              JSONB,
  ADD COLUMN "license_id"           UUID,
  ADD COLUMN "warnings"             TEXT[]          NOT NULL DEFAULT '{}',
  ADD COLUMN "report_seq"           BIGINT,
  ADD COLUMN "vendor_cost_reported" NUMERIC(24, 12),
  ADD COLUMN "vendor_cost_computed" NUMERIC(24, 12);
ALTER TABLE "ai_inference"
  ADD CONSTRAINT "ai_inference_pricing_check"
    CHECK ("pricing" IS NULL OR jsonb_typeof("pricing") = 'object'),
  ADD CONSTRAINT "ai_inference_explain_nonnegative_check"
    CHECK (COALESCE("report_seq", 0) >= 0
      AND COALESCE("vendor_cost_reported", 0) >= 0 AND COALESCE("vendor_cost_computed", 0) >= 0);

-- Whether an unauthorized use of this model and request type was already
-- recorded today, under the pair's lock: one model_usage_unauthorized event
-- per day. Unauthorized rows are the rare ones, so the index stays small.
CREATE INDEX "idx_ai_inference_unauthorized"
  ON "ai_inference" ("instance_id", "entitlement_id", "model_ref", "request_type", "committed_at")
  WHERE "authorized" = false;
-- From a usage journal entry to the AI operation it counted.
CREATE INDEX "idx_ai_inference_report_seq"
  ON "ai_inference" ("instance_id", "entitlement_id", "report_seq")
  WHERE "report_seq" IS NOT NULL;
-- The organization's inferences across instances and pools, newest first, in
-- the keyset order of the listing.
CREATE INDEX "idx_ai_inference_org_reported_at"
  ON "ai_inference" ("organization_id", "reported_at" DESC, "id" DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS "idx_ai_inference_org_reported_at";
DROP INDEX IF EXISTS "idx_ai_inference_report_seq";
DROP INDEX IF EXISTS "idx_ai_inference_unauthorized";
ALTER TABLE "ai_inference" DROP CONSTRAINT IF EXISTS "ai_inference_explain_nonnegative_check";
ALTER TABLE "ai_inference" DROP CONSTRAINT IF EXISTS "ai_inference_pricing_check";
ALTER TABLE "ai_inference"
  DROP COLUMN IF EXISTS "vendor_cost_computed",
  DROP COLUMN IF EXISTS "vendor_cost_reported",
  DROP COLUMN IF EXISTS "report_seq",
  DROP COLUMN IF EXISTS "warnings",
  DROP COLUMN IF EXISTS "license_id",
  DROP COLUMN IF EXISTS "pricing";
-- +goose StatementEnd
