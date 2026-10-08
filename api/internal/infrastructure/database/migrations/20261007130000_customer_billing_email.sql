-- +goose Up
-- +goose StatementBegin
-- The address a SEND_INVOICE invoice is delivered to. Nullable and not
-- backfilled: it is required at subscribe time on a real provider (422
-- SubscribeInstance.BillingEmailMissing) and when switching to STRIPE in
-- SEND_INVOICE, not before. Personal data: never copied into event
-- payloads; snapshotted on the invoice it was sent to.
ALTER TABLE "customer" ADD COLUMN "billing_email" TEXT;
ALTER TABLE "customer"
  ADD CONSTRAINT "customer_billing_email_check" CHECK (
    "billing_email" IS NULL
      OR
    ("billing_email" ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length("billing_email") <= 254)
    );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "customer" DROP CONSTRAINT IF EXISTS "customer_billing_email_check";
ALTER TABLE "customer" DROP COLUMN IF EXISTS "billing_email";
-- +goose StatementEnd
