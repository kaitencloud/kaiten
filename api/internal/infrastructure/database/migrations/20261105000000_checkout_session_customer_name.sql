-- +goose Up
-- +goose StatementBegin
-- The name the buyer gave at the start of a checkout: what the completion
-- names the new customer and its instance. Nullable: a session started
-- without one, and every session before this migration, names both after its
-- e-mail, as before. Personal data like the e-mail, so it goes with the row at
-- the end of its retention.
ALTER TABLE "checkout_session"
  ADD COLUMN "customer_name" TEXT;
ALTER TABLE "checkout_session"
  ADD CONSTRAINT "checkout_session_customer_name_check"
    CHECK ("customer_name" IS NULL OR length(btrim("customer_name")) BETWEEN 1 AND 255);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "checkout_session" DROP CONSTRAINT IF EXISTS "checkout_session_customer_name_check";
ALTER TABLE "checkout_session" DROP COLUMN IF EXISTS "customer_name";
-- +goose StatementEnd
