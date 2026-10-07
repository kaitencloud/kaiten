-- +goose Up
-- +goose StatementBegin
-- CHARGE_AUTOMATICALLY (D-16): the labels of the default payment method the
-- provider holds for a customer. Kaiten never receives, stores or transmits
-- card data -- these are display labels returned by the provider after a
-- setup session, never used for authorization. CHARGE_AUTOMATICALLY requires
-- payment_method_status = 'ACTIVE' (422 at subscribe / switch otherwise);
-- billing-lifecycle flags expiry (customer.payment_method.v1.expiring).
CREATE TYPE "payment_method_status" AS ENUM ('NONE', 'ACTIVE', 'EXPIRED', 'FAILED');

ALTER TABLE "customer_billing"
  ADD COLUMN "default_payment_method_id"  TEXT,
  ADD COLUMN "payment_method_brand"       TEXT,
  ADD COLUMN "payment_method_last4"       CHAR(4),
  ADD COLUMN "payment_method_exp_month"   SMALLINT,
  ADD COLUMN "payment_method_exp_year"    SMALLINT,
  ADD COLUMN "payment_method_status"      "payment_method_status" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "payment_method_attached_at" TIMESTAMP(3);

ALTER TABLE "customer_billing"
  ADD CONSTRAINT "customer_billing_payment_method_check" CHECK (
    ("payment_method_status" = 'NONE'
      AND "default_payment_method_id" IS NULL
      AND "payment_method_attached_at" IS NULL)
      OR
    ("payment_method_status" <> 'NONE'
      AND "default_payment_method_id" IS NOT NULL
      AND "payment_method_attached_at" IS NOT NULL)
    );
ALTER TABLE "customer_billing"
  ADD CONSTRAINT "customer_billing_payment_method_label_check" CHECK (
    ("payment_method_last4" IS NULL OR "payment_method_last4" ~ '^[0-9]{4}$')
      AND ("payment_method_exp_month" IS NULL OR "payment_method_exp_month" BETWEEN 1 AND 12)
      AND ("payment_method_exp_year" IS NULL OR "payment_method_exp_year" BETWEEN 2000 AND 2100)
    );

-- billing-lifecycle: active cards expiring soon.
CREATE INDEX "idx_customer_billing_payment_method_expiry"
  ON "customer_billing" ("payment_method_exp_year", "payment_method_exp_month")
  WHERE "payment_method_status" = 'ACTIVE';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS "idx_customer_billing_payment_method_expiry";
ALTER TABLE "customer_billing" DROP CONSTRAINT IF EXISTS "customer_billing_payment_method_label_check";
ALTER TABLE "customer_billing" DROP CONSTRAINT IF EXISTS "customer_billing_payment_method_check";
ALTER TABLE "customer_billing"
  DROP COLUMN IF EXISTS "payment_method_attached_at",
  DROP COLUMN IF EXISTS "payment_method_status",
  DROP COLUMN IF EXISTS "payment_method_exp_year",
  DROP COLUMN IF EXISTS "payment_method_exp_month",
  DROP COLUMN IF EXISTS "payment_method_last4",
  DROP COLUMN IF EXISTS "payment_method_brand",
  DROP COLUMN IF EXISTS "default_payment_method_id";
DROP TYPE IF EXISTS "payment_method_status";
-- +goose StatementEnd
