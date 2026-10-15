-- +goose Up
-- +goose StatementBegin
-- The enum values of the v3.1 self-serve rules, alone in their migration:
-- PostgreSQL cannot use a value added by ALTER TYPE ... ADD VALUE in the
-- transaction that adds it, and 20261017020000 uses both (a CHECK, a partial
-- index and the freeze function name INCOMPLETE).
--
-- INCOMPLETE: a public checkout with an amount due today waits for the
-- payment of its ACTIVATION invoice (V31-63). It is live for every rule
-- except what the checkout bought, which only the payment applies. It sorts
-- first, like the lifecycle it starts.
--
-- PROVIDER_ITEM_LIMIT: a composed invoice whose provider would receive more
-- items than it accepts (Stripe: 250) is held at composition (V31-61).
ALTER TYPE "instance_billing_status" ADD VALUE 'INCOMPLETE' BEFORE 'TRIAL';
ALTER TYPE "invoice_hold_reason" ADD VALUE 'PROVIDER_ITEM_LIMIT';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- PostgreSQL has no ALTER TYPE ... DROP VALUE. The Down refuses while a row
-- uses either value, then rebuilds both types without it: rename the type,
-- create it again with the 20261007140000 labels, re-type the column, drop
-- the old type. The constraints and the partial index that compare the
-- status with a literal would be re-parsed against the renamed type, so they
-- are dropped first and recreated verbatim after; those that only test
-- hold_reason for NULL are rebuilt by PostgreSQL itself. The freeze function
-- is recreated verbatim so that no session keeps a plan compiled against the
-- old type.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "instance_billing" WHERE "status"::text = 'INCOMPLETE') THEN
    RAISE EXCEPTION 'instance_billing has INCOMPLETE rows; let them expire or cancel them before rolling back 20261017010000';
  END IF;
  IF EXISTS (SELECT 1 FROM "instance_invoice" WHERE "hold_reason"::text = 'PROVIDER_ITEM_LIMIT') THEN
    RAISE EXCEPTION 'instance_invoice has PROVIDER_ITEM_LIMIT holds; void or recompose them before rolling back 20261017010000';
  END IF;
END $$;

ALTER TABLE "instance_billing" DROP CONSTRAINT "instance_billing_canceled_at_check";
ALTER TABLE "instance_billing" DROP CONSTRAINT "instance_billing_cancel_at_period_end_check";
ALTER TABLE "instance_billing" DROP CONSTRAINT "instance_billing_past_due_since_check";
ALTER TABLE "instance_billing" DROP CONSTRAINT "instance_billing_scheduled_check";
ALTER TABLE "instance_billing" DROP CONSTRAINT "instance_billing_trial_check";
DROP INDEX "idx_instance_billing_period_end_live";

ALTER TYPE "instance_billing_status" RENAME TO "instance_billing_status_old";
CREATE TYPE "instance_billing_status" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');
ALTER TABLE "instance_billing"
  ALTER COLUMN "status" TYPE "instance_billing_status" USING "status"::text::"instance_billing_status";
DROP TYPE "instance_billing_status_old";

ALTER TABLE "instance_billing"
  ADD CONSTRAINT "instance_billing_canceled_at_check" CHECK (("status" = 'CANCELED') = ("canceled_at" IS NOT NULL));
ALTER TABLE "instance_billing"
  ADD CONSTRAINT "instance_billing_cancel_at_period_end_check" CHECK (
    NOT "cancel_at_period_end" OR ("status" <> 'CANCELED' AND "cancel_requested_at" IS NOT NULL)
    );
ALTER TABLE "instance_billing"
  ADD CONSTRAINT "instance_billing_past_due_since_check" CHECK (("status" = 'PAST_DUE') = ("past_due_since" IS NOT NULL));
ALTER TABLE "instance_billing"
  ADD CONSTRAINT "instance_billing_scheduled_check" CHECK (
    ("scheduled_license_price_id" IS NULL AND "scheduled_at" IS NULL)
      OR
    ("scheduled_license_price_id" IS NOT NULL AND "scheduled_at" IS NOT NULL
      AND "scheduled_license_price_id" <> "base_license_price_id"
      AND "status" <> 'CANCELED')
    );
ALTER TABLE "instance_billing"
  ADD CONSTRAINT "instance_billing_trial_check" CHECK (
    "status" <> 'TRIAL' OR ("trial_ends_at" IS NOT NULL AND "current_period_end" = "trial_ends_at")
    );
CREATE INDEX "idx_instance_billing_period_end_live"
  ON "instance_billing" ("current_period_end")
  WHERE "status" IN ('TRIAL', 'ACTIVE', 'PAST_DUE');

CREATE OR REPLACE FUNCTION instance_billing_freeze()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
DECLARE
  billing_status instance_billing_status;
BEGIN
IF NEW."customer_id" IS NOT DISTINCT FROM OLD."customer_id"
   AND NEW."license_id" IS NOT DISTINCT FROM OLD."license_id" THEN
  RETURN NEW;
END IF;
SELECT ib."status"
INTO billing_status
FROM public."instance_billing" ib
WHERE ib."instance_id" = NEW."id"
FOR SHARE;
IF billing_status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
   AND current_setting('kaiten.billing_apply_plan_change', true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'instance % has a % subscription: its customer and license are frozen', NEW."id", billing_status
    USING ERRCODE = 'restrict_violation', CONSTRAINT = 'instance_billing_freeze';
END IF;
RETURN NEW;
END;
$$;

ALTER TYPE "invoice_hold_reason" RENAME TO "invoice_hold_reason_old";
CREATE TYPE "invoice_hold_reason" AS ENUM (
  'LEDGER_SEQUENCE_GAP', 'LEDGER_CHAIN_BREAK', 'LEDGER_COUNTER_MISMATCH');
ALTER TABLE "instance_invoice"
  ALTER COLUMN "hold_reason" TYPE "invoice_hold_reason" USING "hold_reason"::text::"invoice_hold_reason";
DROP TYPE "invoice_hold_reason_old";
-- +goose StatementEnd

