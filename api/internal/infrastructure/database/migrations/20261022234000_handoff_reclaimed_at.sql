-- +goose Up
-- +goose StatementBegin
-- When an invoice was last claimed again after its lease expired (§12.2 rule
-- 1, §19.3): what the health section's handoff.reclaimedLast24h counts. A
-- claim sets it when the invoice had been claimed before; nothing clears it.
-- Invoices re-claimed before this migration have none.
ALTER TABLE "instance_invoice"
  ADD COLUMN "handoff_reclaimed_at" TIMESTAMP(3);
ALTER TABLE "instance_invoice"
  ADD CONSTRAINT "instance_invoice_handoff_reclaimed_at_check"
    CHECK ("handoff_reclaimed_at" IS NULL OR "handoff_claim_count" >= 2);
CREATE INDEX "idx_instance_invoice_org_handoff_reclaimed_at"
  ON "instance_invoice" ("organization_id", "handoff_reclaimed_at")
  WHERE "handoff_reclaimed_at" IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS "idx_instance_invoice_org_handoff_reclaimed_at";
ALTER TABLE "instance_invoice" DROP CONSTRAINT IF EXISTS "instance_invoice_handoff_reclaimed_at_check";
ALTER TABLE "instance_invoice" DROP COLUMN IF EXISTS "handoff_reclaimed_at";
-- +goose StatementEnd
