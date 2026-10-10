-- +goose Up
-- +goose StatementBegin
-- Payment providers, whichever they are.
--
-- 20261007140000 wrote the provider rules for STRIPE by name. They hold for
-- every provider that pushes invoices, so they are restated here as "not NOOP":
-- a later provider then only adds its value to billing_provider_kind.
ALTER TABLE "instance_invoice" DROP CONSTRAINT "instance_invoice_provider_status_check";
ALTER TABLE "instance_invoice"
  ADD CONSTRAINT "instance_invoice_provider_status_check" CHECK (
    ("provider_kind" = 'NOOP'
      AND "status" NOT IN ('PUSHED', 'PUSH_FAILED', 'PAYMENT_FAILED')
      AND "external_invoice_id" IS NULL
      AND "provider_status" IS NULL
      AND "reconciliation_status" IS NULL)
      OR
    ("provider_kind" <> 'NOOP' AND "status" <> 'MANUAL')
    );

DROP INDEX "idx_instance_invoice_push_queue";
CREATE INDEX "idx_instance_invoice_push_queue"
  ON "instance_invoice" ("next_push_at")
  WHERE "provider_kind" <> 'NOOP' AND "status" IN ('DRAFT', 'PUSH_FAILED') AND "hold_reason" IS NULL;

CREATE TYPE "billing_sync_status" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- The provider side of a customer: one row per (customer, provider), none for
-- NOOP (absence of a row, not an empty one: every read LEFT JOINs). The
-- provider's settings live with its connector, not here. CASCADE from
-- customer: the mapping is meaningless without the customer, and each invoice
-- keeps its own external_customer_id snapshot.
CREATE TABLE "customer_billing"
(
  "customer_id"          UUID                    NOT NULL,
  "organization_id"      UUID                    NOT NULL,
  "provider_kind"        "billing_provider_kind" NOT NULL,
  "external_customer_id" TEXT                    NOT NULL,
  "web_url"              TEXT,
  "synced_at"            TIMESTAMP(3),
  "last_error"           TEXT,
  "created_at"           TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "customer_billing_pkey" PRIMARY KEY ("customer_id", "provider_kind"),
  CONSTRAINT "customer_billing_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_billing_customer_id_fkey" FOREIGN KEY ("customer_id", "organization_id")
    REFERENCES "customer" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_billing_external_customer_key" UNIQUE ("organization_id", "provider_kind", "external_customer_id"),
  CONSTRAINT "customer_billing_provider_kind_check" CHECK ("provider_kind" <> 'NOOP'),
  CONSTRAINT "customer_billing_external_customer_id_check" CHECK (char_length("external_customer_id") > 0)
);

-- billing-provider-sync bookkeeping, one row per (organization, provider):
-- the change feed's cursor (read with an overlap, idempotent per event), the
-- last daily sweep of open invoices by id, and the health shown in Settings.
CREATE TABLE "billing_sync_state"
(
  "organization_id"      UUID                    NOT NULL,
  "provider_kind"        "billing_provider_kind" NOT NULL,
  "cursor"               TEXT,
  "cursor_created_at"    TIMESTAMP(3),
  "last_synced_at"       TIMESTAMP(3),
  "last_sync_status"     "billing_sync_status",
  "last_sync_error"      TEXT,
  "consecutive_failures" INTEGER                 NOT NULL DEFAULT 0,
  "last_full_sweep_at"   TIMESTAMP(3),
  "created_at"           TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_sync_state_pkey" PRIMARY KEY ("organization_id", "provider_kind"),
  CONSTRAINT "billing_sync_state_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "billing_sync_state_provider_kind_check" CHECK ("provider_kind" <> 'NOOP'),
  CONSTRAINT "billing_sync_state_consecutive_failures_check" CHECK ("consecutive_failures" >= 0),
  CONSTRAINT "billing_sync_state_status_check" CHECK (("last_synced_at" IS NULL) = ("last_sync_status" IS NULL))
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "billing_sync_state";
DROP TABLE IF EXISTS "customer_billing";
DROP TYPE IF EXISTS "billing_sync_status";

DROP INDEX "idx_instance_invoice_push_queue";
CREATE INDEX "idx_instance_invoice_push_queue"
  ON "instance_invoice" ("next_push_at")
  WHERE "provider_kind" = 'STRIPE' AND "status" IN ('DRAFT', 'PUSH_FAILED') AND "hold_reason" IS NULL;

ALTER TABLE "instance_invoice" DROP CONSTRAINT "instance_invoice_provider_status_check";
ALTER TABLE "instance_invoice"
  ADD CONSTRAINT "instance_invoice_provider_status_check" CHECK (
    ("provider_kind" = 'NOOP'
      AND "status" NOT IN ('PUSHED', 'PUSH_FAILED', 'PAYMENT_FAILED')
      AND "external_invoice_id" IS NULL
      AND "provider_status" IS NULL
      AND "reconciliation_status" IS NULL)
      OR
    ("provider_kind" = 'STRIPE' AND "status" <> 'MANUAL')
    );
-- +goose StatementEnd
