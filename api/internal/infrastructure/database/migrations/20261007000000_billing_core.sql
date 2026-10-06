-- +goose Up
-- +goose StatementBegin
-- Subscriptions and invoices: organization_billing_settings, instance_billing,
-- instance_invoice, the instance_billing_freeze trigger.

CREATE TYPE "collection_method" AS ENUM ('SEND_INVOICE', 'CHARGE_AUTOMATICALLY');
-- NOOP is a provider kind, not a provider row: no seed, no table.
CREATE TYPE "billing_provider_kind" AS ENUM ('NOOP', 'STRIPE');
-- PAUSED is deferred and therefore absent: ALTER TYPE ... ADD VALUE when a
-- flow defines it.
CREATE TYPE "instance_billing_status" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED');
CREATE TYPE "invoice_kind" AS ENUM ('ACTIVATION', 'RENEWAL', 'FINAL');
CREATE TYPE "invoice_status" AS ENUM (
  'DRAFT', 'PUSHED', 'PUSH_FAILED', 'MANUAL', 'PAID', 'PAYMENT_FAILED', 'UNCOLLECTIBLE', 'VOID');
-- The three usage journal invariants the period close checks, one value each.
CREATE TYPE "invoice_hold_reason" AS ENUM (
  'LEDGER_SEQUENCE_GAP', 'LEDGER_CHAIN_BREAK', 'LEDGER_COUNTER_MISMATCH');
CREATE TYPE "reconciliation_status" AS ENUM ('MATCHED', 'MISMATCH');
CREATE TYPE "handoff_status" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ACKNOWLEDGED');

-- Organization defaults. Optional row: an absent row means
-- every default below, so nothing is seeded and a new organization needs no
-- write to start billing.
CREATE TABLE "organization_billing_settings"
(
  "organization_id"           UUID                NOT NULL,
  "default_collection_method" "collection_method" NOT NULL DEFAULT 'SEND_INVOICE',
  "default_days_until_due"    INTEGER             NOT NULL DEFAULT 30,
  "handoff_stripe_invoices"   BOOLEAN             NOT NULL DEFAULT FALSE,
  "created_at"                TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"             UUID                NOT NULL,
  "updated_at"                TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"             UUID                NOT NULL,

  CONSTRAINT "organization_billing_settings_pkey" PRIMARY KEY ("organization_id"),
  CONSTRAINT "organization_billing_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organization_billing_settings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_billing_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "organization_billing_settings_days_until_due_check" CHECK ("default_days_until_due" BETWEEN 0 AND 365)
);

-- Tenant guard for the references that cannot be composite foreign keys.
--
-- A reference that must survive its parent (an invoice outlives its customer,
-- a subscription row outlives its instance) needs ON DELETE SET NULL.
-- On a composite (x_id, organization_id) key a plain SET NULL would null
-- organization_id too, which is NOT NULL; the column-list form
-- ON DELETE SET NULL (x_id) is PostgreSQL 15+. Those references are therefore
-- single-column foreign keys, like audit_trail_instance_id_fkey, and this
-- trigger restores what the composite key would have guaranteed: the
-- referenced row belongs to the referencing row's organization. It runs AFTER
-- INSERT OR UPDATE OF the column only, returns early on NULL (so the SET NULL
-- action itself passes), and reports a foreign row exactly as a missing one --
-- 23503 under the foreign key's own name -- so the write path maps both to the
-- same 404 and the response is no cross-tenant existence oracle
-- (20260816010000).
--
--   TG_ARGV[0]  referencing column    TG_ARGV[1]  referenced table
--   TG_ARGV[2]  constraint name to report
CREATE FUNCTION billing_reference_same_tenant()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
DECLARE
  ref_id  UUID;
  ref_org UUID;
BEGIN
ref_id := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
IF ref_id IS NULL THEN
  RETURN NEW;
END IF;
IF TG_OP = 'UPDATE' AND ref_id IS NOT DISTINCT FROM (to_jsonb(OLD) ->> TG_ARGV[0])::uuid THEN
  RETURN NEW;
END IF;
EXECUTE format('SELECT "organization_id" FROM public.%I WHERE "id" = $1 FOR KEY SHARE', TG_ARGV[1])
  INTO ref_org
  USING ref_id;
IF ref_org IS DISTINCT FROM NEW."organization_id" THEN
  RAISE EXCEPTION '% % does not exist in organization %', TG_ARGV[1], ref_id, NEW."organization_id"
    USING ERRCODE = 'foreign_key_violation', CONSTRAINT = TG_ARGV[2];
END IF;
RETURN NEW;
END;
$$;

-- One subscription row per instance, for life: resubscribing a CANCELED
-- row reactivates it (new base price, new anchor, periods reset).
--
-- instance_id is NULLable only so the row can outlive its instance: deletion of
-- a billed instance is refused (409 DeleteInstance.BillingActive, an
-- application guard -- a trigger would also block organization erasure), and
-- once it is allowed (CANCELED, nothing unpaid) the instance goes and this row
-- stays with instance_id NULL, carrying the identity snapshot its invoices
-- point at. UNIQUE (instance_id) still allows any number of such tombstones
-- (NULLs are distinct). customer_id follows the same rule.
--
-- anchor_at is the billing anchor, truncated to the second (subscribe accepts
-- a startAt up to one period in the past). Periods are computed by Kaiten from
-- anchor_at + billing_period in UTC.
--
-- billing_period and currency are copied from the base price at subscribe and
-- at a plan change, so period arithmetic and the add-on currency check need no
-- join. collection_method and days_until_due are per deal; NULL means
-- the organization default (organization_billing_settings, else SEND_INVOICE /
-- 30).
--
-- scheduled_license_price_id is the pending plan change, applied by the
-- RENEWAL close transaction, which is the one writer allowed through the
-- freeze.
CREATE TABLE "instance_billing"
(
  "id"                         UUID                      NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"            UUID                      NOT NULL,
  "instance_id"                UUID,
  "customer_id"                UUID,
  "instance_slug"              TEXT                      NOT NULL,
  "instance_name"              TEXT                      NOT NULL,
  "customer_slug"              TEXT                      NOT NULL,
  "customer_name"              TEXT                      NOT NULL,
  "status"                     "instance_billing_status" NOT NULL,
  "provider_kind"              "billing_provider_kind"   NOT NULL,
  "collection_method"          "collection_method",
  "days_until_due"             INTEGER,
  "base_license_price_id"      UUID                      NOT NULL,
  "billing_period"             "billing_period"          NOT NULL,
  "currency"                   CHAR(3)                   NOT NULL,
  "anchor_at"                  TIMESTAMP(3)              NOT NULL,
  "started_at"                 TIMESTAMP(3)              NOT NULL,
  "current_period_start"       TIMESTAMP(3)              NOT NULL,
  "current_period_end"         TIMESTAMP(3)              NOT NULL,
  "cancel_at_period_end"       BOOLEAN                   NOT NULL DEFAULT FALSE,
  "cancel_requested_at"        TIMESTAMP(3),
  "canceled_at"                TIMESTAMP(3),
  "cancellation_reason"        TEXT,
  "past_due_since"             TIMESTAMP(3),
  "scheduled_license_price_id" UUID,
  "scheduled_at"               TIMESTAMP(3),
  "created_at"                 TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"              UUID                      NOT NULL,
  "updated_at"                 TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"              UUID                      NOT NULL,

  CONSTRAINT "instance_billing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instance_billing_id_organization_id_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "instance_billing_instance_id_key" UNIQUE ("instance_id"),
  CONSTRAINT "instance_billing_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_billing_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instance" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "instance_billing_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "instance_billing_base_license_price_id_fkey" FOREIGN KEY ("base_license_price_id", "organization_id")
    REFERENCES "license_price" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_billing_scheduled_license_price_id_fkey" FOREIGN KEY ("scheduled_license_price_id", "organization_id")
    REFERENCES "license_price" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_billing_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_billing_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_billing_anchor_at_check" CHECK ("anchor_at" = date_trunc('second', "anchor_at")),
  CONSTRAINT "instance_billing_period_check" CHECK ("current_period_start" < "current_period_end"),
  CONSTRAINT "instance_billing_days_until_due_check" CHECK ("days_until_due" IS NULL OR "days_until_due" BETWEEN 0 AND 365),
  CONSTRAINT "instance_billing_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "instance_billing_canceled_at_check" CHECK (("status" = 'CANCELED') = ("canceled_at" IS NOT NULL)),
  CONSTRAINT "instance_billing_cancel_at_period_end_check" CHECK (
    NOT "cancel_at_period_end" OR ("status" <> 'CANCELED' AND "cancel_requested_at" IS NOT NULL)
    ),
  CONSTRAINT "instance_billing_past_due_since_check" CHECK (("status" = 'PAST_DUE') = ("past_due_since" IS NOT NULL)),
  CONSTRAINT "instance_billing_scheduled_check" CHECK (
    ("scheduled_license_price_id" IS NULL AND "scheduled_at" IS NULL)
      OR
    ("scheduled_license_price_id" IS NOT NULL AND "scheduled_at" IS NOT NULL
      AND "scheduled_license_price_id" <> "base_license_price_id"
      AND "status" <> 'CANCELED')
    ),
  CONSTRAINT "instance_billing_snapshot_check" CHECK (
    char_length("instance_slug") > 0 AND char_length("customer_slug") > 0
    )
);

CREATE TRIGGER "instance_billing_instance_same_tenant_trigger"
  AFTER INSERT OR UPDATE OF "instance_id" ON "instance_billing"
  FOR EACH ROW EXECUTE FUNCTION billing_reference_same_tenant('instance_id', 'instance', 'instance_billing_instance_id_fkey');
CREATE TRIGGER "instance_billing_customer_same_tenant_trigger"
  AFTER INSERT OR UPDATE OF "customer_id" ON "instance_billing"
  FOR EACH ROW EXECUTE FUNCTION billing_reference_same_tenant('customer_id', 'customer', 'instance_billing_customer_id_fkey');

-- billing-period-close (every 5 min, all organizations): the live
-- subscriptions whose period has ended -- RENEWAL, FINAL at period end, trial
-- conversion -- oldest boundary first.
CREATE INDEX "idx_instance_billing_period_end_live"
  ON "instance_billing" ("current_period_end")
  WHERE "status" IN ('TRIAL', 'ACTIVE', 'PAST_DUE');
CREATE INDEX "idx_instance_billing_org_created_at"
  ON "instance_billing" ("organization_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_instance_billing_org_status"
  ON "instance_billing" ("organization_id", "status");
-- Price RESTRICT checks, and the grant freeze ("is this version billed, as
-- current or scheduled target?").
CREATE INDEX "idx_instance_billing_base_license_price"
  ON "instance_billing" ("base_license_price_id");
CREATE INDEX "idx_instance_billing_scheduled_license_price"
  ON "instance_billing" ("scheduled_license_price_id")
  WHERE "scheduled_license_price_id" IS NOT NULL;
CREATE INDEX "idx_instance_billing_customer"
  ON "instance_billing" ("customer_id")
  WHERE "customer_id" IS NOT NULL;

-- The period-close artifact. Its id is the
-- idempotency key of every provider call made for it.
--
-- Identity: kind + boundary_at. ACTIVATION at subscribe or trial end, RENEWAL
-- at each period end (arrears of the elapsed period + advance of the next),
-- FINAL at cancellation. Exactly one non-void invoice per (subscription, kind,
-- boundary) under concurrent closes and restarts; a VOID
-- invoice leaves the key, which is what lets recompose issue its replacement.
--
-- Money is integer minor units: lines are rounded HALF_UP one by one,
-- totals are sums of rounded lines, discounts are negative lines capped so the
-- total never goes below zero -- hence discount_total_minor <= subtotal_minor
-- rather than a floor applied after the fact, because the pushed lines must sum
-- exactly to the total (reconciliation tolerance 0).
--
-- lines is the array of line snapshots: what makes the billed state at time T
-- reconstructible from invoices + usage_ledger without CDC.
--
-- Identity snapshot: the invoice survives deletion of its customer
-- (customer_id SET NULL, single-column + tenant guard) and, through
-- instance_billing, of its instance; the snapshot columns keep it readable and
-- exportable. billing_email is the address it was sent to -- personal data,
-- excluded from event payloads.
--
-- provider_kind, collection_method and the external ids are per invoice:
-- a provider switch applies to the next composition only, and void and
-- sync route by the invoice's own provider_kind.
--
-- Handoff: MANUAL invoices start PENDING, Stripe ones
-- NOT_REQUIRED unless organization_billing_settings.handoff_stripe_invoices;
-- the pull queue claims PENDING rows whose lease is free with FOR UPDATE SKIP
-- LOCKED and sets handoff_lease_id/handoff_leased_until.
CREATE TABLE "instance_invoice"
(
  "id"                                 UUID                    NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"                    UUID                    NOT NULL,
  "instance_billing_id"                UUID                    NOT NULL,
  "customer_id"                        UUID,
  "instance_slug"                      TEXT                    NOT NULL,
  "instance_name"                      TEXT                    NOT NULL,
  "customer_slug"                      TEXT                    NOT NULL,
  "customer_name"                      TEXT                    NOT NULL,
  "license_id"                         UUID                    NOT NULL,
  "license_slug"                       TEXT                    NOT NULL,
  "billing_email"                      TEXT,
  "kind"                               "invoice_kind"          NOT NULL,
  "boundary_at"                        TIMESTAMP(3)            NOT NULL,
  "service_from"                       TIMESTAMP(3)            NOT NULL,
  "service_to"                         TIMESTAMP(3)            NOT NULL,
  "currency"                           CHAR(3)                 NOT NULL,
  "subtotal_minor"                     BIGINT                  NOT NULL,
  "discount_total_minor"               BIGINT                  NOT NULL DEFAULT 0,
  "total_minor"                        BIGINT                  NOT NULL,
  "lines"                              JSONB                   NOT NULL,
  "status"                             "invoice_status"        NOT NULL,
  "hold_reason"                        "invoice_hold_reason",
  "hold_detail"                        JSONB,
  "held_at"                            TIMESTAMP(3),
  "hold_released_at"                   TIMESTAMP(3),
  "hold_released_by_id"                UUID,
  "hold_release_reason"                TEXT,
  "provider_kind"                      "billing_provider_kind" NOT NULL,
  "collection_method"                  "collection_method"     NOT NULL,
  "external_customer_id"               TEXT,
  "external_invoice_id"                TEXT,
  "provider_invoice_number"            TEXT,
  "provider_status"                    TEXT,
  "hosted_invoice_url"                 TEXT,
  "invoice_pdf_url"                    TEXT,
  "provider_total_excluding_tax_minor" BIGINT,
  "reconciliation_status"              "reconciliation_status",
  "reconciliation_detail"              JSONB,
  "reconciled_at"                      TIMESTAMP(3),
  "push_attempts"                      INTEGER                 NOT NULL DEFAULT 0,
  "next_push_at"                       TIMESTAMP(3),
  "last_push_error"                    TEXT,
  "pushed_at"                          TIMESTAMP(3),
  "synced_at"                          TIMESTAMP(3),
  "issued_at"                          TIMESTAMP(3),
  "days_until_due"                     INTEGER,
  "due_at"                             TIMESTAMP(3),
  "paid_at"                            TIMESTAMP(3),
  "marked_paid_by_id"                  UUID,
  "payment_failed_at"                  TIMESTAMP(3),
  "last_payment_error"                 TEXT,
  "uncollectible_at"                   TIMESTAMP(3),
  "voided_at"                          TIMESTAMP(3),
  "voided_by_id"                       UUID,
  "void_reason"                        TEXT,
  "replaces_invoice_id"                UUID,
  "handoff_status"                     "handoff_status"        NOT NULL DEFAULT 'NOT_REQUIRED',
  "handoff_lease_id"                   UUID,
  "handoff_leased_until"               TIMESTAMP(3),
  "handoff_claim_count"                INTEGER                 NOT NULL DEFAULT 0,
  "handoff_acknowledged_at"            TIMESTAMP(3),
  "handoff_acknowledged_by_id"         UUID,
  "external_reference"                 TEXT,
  "created_at"                         TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                         TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "instance_invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instance_invoice_id_organization_id_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "instance_invoice_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- NO ACTION, not RESTRICT: instance_billing rows are never deleted by the
  -- application, only by organization erasure, which cascades into both tables
  -- in one statement; NO ACTION is checked at the end of that statement, when
  -- the invoices are already gone.
  CONSTRAINT "instance_invoice_instance_billing_id_fkey" FOREIGN KEY ("instance_billing_id", "organization_id")
    REFERENCES "instance_billing" ("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "instance_invoice_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "instance_invoice_replaces_invoice_id_fkey" FOREIGN KEY ("replaces_invoice_id", "organization_id")
    REFERENCES "instance_invoice" ("id", "organization_id") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "instance_invoice_hold_released_by_id_fkey" FOREIGN KEY ("hold_released_by_id") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "instance_invoice_marked_paid_by_id_fkey" FOREIGN KEY ("marked_paid_by_id") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "instance_invoice_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "instance_invoice_handoff_acknowledged_by_id_fkey" FOREIGN KEY ("handoff_acknowledged_by_id") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,

  -- Money.
  CONSTRAINT "instance_invoice_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "instance_invoice_total_check" CHECK (
    "subtotal_minor" >= 0
      AND "discount_total_minor" >= 0
      AND "discount_total_minor" <= "subtotal_minor"
      AND "total_minor" = "subtotal_minor" - "discount_total_minor"
    ),
  CONSTRAINT "instance_invoice_lines_check" CHECK (jsonb_typeof("lines") = 'array'),
  CONSTRAINT "instance_invoice_service_period_check" CHECK ("service_from" <= "service_to"),

  -- Holds exist only on drafts: a held invoice is never pushed,
  -- issued or handed off until released or recomposed.
  CONSTRAINT "instance_invoice_hold_check" CHECK (
    ("hold_reason" IS NULL OR "status" = 'DRAFT')
      AND ("hold_reason" IS NULL) = ("held_at" IS NULL)
      AND ("hold_detail" IS NULL OR "hold_reason" IS NOT NULL)
    ),
  CONSTRAINT "instance_invoice_hold_release_check" CHECK (
    ("hold_released_at" IS NULL) = ("hold_release_reason" IS NULL)
    ),

  -- Status machine per provider kind.
  CONSTRAINT "instance_invoice_provider_status_check" CHECK (
    ("provider_kind" = 'NOOP'
      AND "status" NOT IN ('PUSHED', 'PUSH_FAILED', 'PAYMENT_FAILED')
      AND "external_invoice_id" IS NULL
      AND "provider_status" IS NULL
      AND "reconciliation_status" IS NULL)
      OR
    ("provider_kind" = 'STRIPE' AND "status" <> 'MANUAL')
    ),
  CONSTRAINT "instance_invoice_provider_status_value_check" CHECK (
    "provider_status" IS NULL OR "provider_status" IN ('draft', 'open', 'paid', 'uncollectible', 'void')
    ),
  CONSTRAINT "instance_invoice_pushed_check" CHECK (
    "status" NOT IN ('PUSHED', 'PAYMENT_FAILED') OR "external_invoice_id" IS NOT NULL
    ),
  CONSTRAINT "instance_invoice_push_attempts_check" CHECK ("push_attempts" >= 0),

  -- Issue and terms: due_at = issued_at + days_until_due, frozen at
  -- issue. A draft, a failed push and a void (of either) may be unissued.
  CONSTRAINT "instance_invoice_issued_check" CHECK (
    "status" IN ('DRAFT', 'PUSH_FAILED', 'VOID') OR "issued_at" IS NOT NULL
    ),
  CONSTRAINT "instance_invoice_due_check" CHECK (
    ("issued_at" IS NULL AND "days_until_due" IS NULL AND "due_at" IS NULL)
      OR
    ("issued_at" IS NOT NULL AND "days_until_due" IS NOT NULL AND "due_at" IS NOT NULL
      AND "days_until_due" BETWEEN 0 AND 365
      AND "due_at" = "issued_at" + make_interval(days => "days_until_due"))
    ),
  CONSTRAINT "instance_invoice_paid_check" CHECK (("status" = 'PAID') = ("paid_at" IS NOT NULL)),
  CONSTRAINT "instance_invoice_payment_failed_check" CHECK ("status" <> 'PAYMENT_FAILED' OR "payment_failed_at" IS NOT NULL),
  CONSTRAINT "instance_invoice_uncollectible_check" CHECK ("status" <> 'UNCOLLECTIBLE' OR "uncollectible_at" IS NOT NULL),
  CONSTRAINT "instance_invoice_void_check" CHECK (("status" = 'VOID') = ("voided_at" IS NOT NULL)),
  CONSTRAINT "instance_invoice_replaces_invoice_id_check" CHECK ("replaces_invoice_id" IS DISTINCT FROM "id"),

  -- Reconciliation is a Stripe-only comparison.
  CONSTRAINT "instance_invoice_reconciliation_check" CHECK (
    ("reconciliation_status" IS NULL) = ("reconciled_at" IS NULL)
    ),

  -- Handoff queue.
  CONSTRAINT "instance_invoice_handoff_draft_check" CHECK (
    "handoff_status" = 'NOT_REQUIRED' OR "status" NOT IN ('DRAFT', 'PUSH_FAILED')
    ),
  CONSTRAINT "instance_invoice_handoff_lease_check" CHECK (
    ("handoff_lease_id" IS NULL) = ("handoff_leased_until" IS NULL)
      AND ("handoff_lease_id" IS NULL OR "handoff_status" = 'PENDING')
    ),
  CONSTRAINT "instance_invoice_handoff_acknowledged_check" CHECK (
    ("handoff_status" = 'ACKNOWLEDGED') = ("handoff_acknowledged_at" IS NOT NULL)
    ),
  CONSTRAINT "instance_invoice_handoff_claim_count_check" CHECK ("handoff_claim_count" >= 0),
  CONSTRAINT "instance_invoice_external_reference_check" CHECK (
    "external_reference" IS NULL OR char_length("external_reference") BETWEEN 1 AND 255
    ),
  CONSTRAINT "instance_invoice_snapshot_check" CHECK (
    char_length("instance_slug") > 0 AND char_length("customer_slug") > 0 AND char_length("license_slug") > 0
    )
);

CREATE TRIGGER "instance_invoice_customer_same_tenant_trigger"
  AFTER INSERT OR UPDATE OF "customer_id" ON "instance_invoice"
  FOR EACH ROW EXECUTE FUNCTION billing_reference_same_tenant('customer_id', 'customer', 'instance_invoice_customer_id_fkey');

-- Invoice identity: one live invoice per (subscription, kind, boundary).
CREATE UNIQUE INDEX "instance_invoice_boundary_key"
  ON "instance_invoice" ("instance_billing_id", "kind", "boundary_at")
  WHERE "status" <> 'VOID';
-- One Kaiten invoice per provider invoice: a retried push that lost its
-- response can never attach a second Stripe invoice.
CREATE UNIQUE INDEX "instance_invoice_external_invoice_key"
  ON "instance_invoice" ("provider_kind", "external_invoice_id")
  WHERE "external_invoice_id" IS NOT NULL;
-- A voided invoice is replaced at most once (recompose after VOID).
CREATE UNIQUE INDEX "instance_invoice_replaces_invoice_id_key"
  ON "instance_invoice" ("replaces_invoice_id")
  WHERE "replaces_invoice_id" IS NOT NULL;

-- Lists: per organization (keyset), per subscription (instance tab), per
-- customer (portal session), and the updatedSince sync of exports.
CREATE INDEX "idx_instance_invoice_org_created_at"
  ON "instance_invoice" ("organization_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_instance_invoice_billing_boundary"
  ON "instance_invoice" ("instance_billing_id", "boundary_at" DESC, "id" DESC);
CREATE INDEX "idx_instance_invoice_customer_boundary"
  ON "instance_invoice" ("customer_id", "boundary_at" DESC, "id" DESC)
  WHERE "customer_id" IS NOT NULL;
CREATE INDEX "idx_instance_invoice_org_updated_at"
  ON "instance_invoice" ("organization_id", "updated_at", "id");
-- Handoff queue: oldest PENDING first, per organization.
CREATE INDEX "idx_instance_invoice_handoff_pending"
  ON "instance_invoice" ("organization_id", "issued_at", "id")
  WHERE "handoff_status" = 'PENDING';
-- Overdue: billing-lifecycle (all organizations, by due date) and the
-- console's ?overdue=true filter (per organization).
CREATE INDEX "idx_instance_invoice_open_due_at"
  ON "instance_invoice" ("due_at")
  WHERE "status" IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED');
CREATE INDEX "idx_instance_invoice_org_open_due_at"
  ON "instance_invoice" ("organization_id", "due_at")
  WHERE "status" IN ('PUSHED', 'MANUAL', 'PAYMENT_FAILED');
-- billing-invoice-push (every minute): Stripe drafts and failed pushes that
-- are not held, by next attempt.
CREATE INDEX "idx_instance_invoice_push_queue"
  ON "instance_invoice" ("next_push_at")
  WHERE "provider_kind" = 'STRIPE' AND "status" IN ('DRAFT', 'PUSH_FAILED') AND "hold_reason" IS NULL;
-- billing-provider-sync daily sweep of open provider invoices, least recently
-- synced first.
CREATE INDEX "idx_instance_invoice_provider_open"
  ON "instance_invoice" ("provider_kind", "synced_at")
  WHERE "status" IN ('PUSHED', 'PAYMENT_FAILED');
-- Held drafts the close job re-checks on each pass.
CREATE INDEX "idx_instance_invoice_held"
  ON "instance_invoice" ("instance_billing_id")
  WHERE "hold_reason" IS NOT NULL;

-- The freeze. While an instance's subscription is TRIAL, ACTIVE or
-- PAST_DUE, its customer_id and license_id are the contract: changing the
-- licence would silently diverge from the pinned base price, changing the
-- customer would move a live contract to another payer. EditInstance is the
-- only writer (PUT /instances and the integration upsert both go through it)
-- and maps the error to 409 UpdateInstance.BillingActive by constraint name.
--
-- The one legitimate writer is the RENEWAL close transaction applying a
-- scheduled plan change: it runs
--   SET LOCAL kaiten.billing_apply_plan_change = 'on'
-- before its UPDATE "instance" SET "license_id" = ..., in the same transaction
-- as the invoice it composes. SET LOCAL ends with the transaction, so nothing
-- else inherits it; current_setting(..., true) returns NULL when it was never
-- set.
--
-- AFTER UPDATE OF, like instance_license_not_archived_update_trigger, so a PUT
-- that rewrites slug keeps taking FOR NO KEY UPDATE. The billing row is read
-- FOR SHARE so a concurrent status transition (cancel, reactivate) serializes
-- with the edit.
CREATE FUNCTION instance_billing_freeze()
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

CREATE TRIGGER "instance_billing_freeze_trigger"
  AFTER UPDATE OF "customer_id", "license_id" ON "instance"
  FOR EACH ROW EXECUTE FUNCTION instance_billing_freeze();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS "instance_billing_freeze_trigger" ON "instance";
DROP FUNCTION IF EXISTS instance_billing_freeze();
DROP TABLE IF EXISTS "instance_invoice";
DROP TABLE IF EXISTS "instance_billing";
DROP FUNCTION IF EXISTS billing_reference_same_tenant();
DROP TABLE IF EXISTS "organization_billing_settings";
DROP TYPE IF EXISTS "handoff_status";
DROP TYPE IF EXISTS "reconciliation_status";
DROP TYPE IF EXISTS "invoice_hold_reason";
DROP TYPE IF EXISTS "invoice_status";
DROP TYPE IF EXISTS "invoice_kind";
DROP TYPE IF EXISTS "instance_billing_status";
DROP TYPE IF EXISTS "billing_provider_kind";
DROP TYPE IF EXISTS "collection_method";
-- +goose StatementEnd
