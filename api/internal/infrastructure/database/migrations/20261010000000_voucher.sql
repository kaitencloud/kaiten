-- +goose Up
-- +goose StatementBegin
-- Vouchers: PRICE (a discount on invoices) and ENTITLEMENT_BOOST (a temporary
-- change to entitlement values). Other types are added with ALTER TYPE ... ADD
-- VALUE when they ship.

CREATE TYPE "voucher_type" AS ENUM ('PRICE', 'ENTITLEMENT_BOOST');
CREATE TYPE "voucher_status" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'EXHAUSTED', 'ARCHIVED');
CREATE TYPE "voucher_duration" AS ENUM ('ONE_TIME', 'REPEATING', 'FOREVER');
CREATE TYPE "price_discount_type" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
CREATE TYPE "price_applies_to" AS ENUM ('LICENSE_BASE', 'ADDONS', 'BOTH', 'SELECTED_PRICES');
CREATE TYPE "boost_modifier_type" AS ENUM ('SET', 'ADD', 'MULTIPLY', 'UNLIMITED');
CREATE TYPE "instance_voucher_status" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- A redeemable code. Administration routes address vouchers by id; the code
-- only travels in request bodies (never in a URL).
--
-- code_normalized is what is unique and what redemption looks up: upper case,
-- separators and anything else non-alphanumeric removed, so "summer-2027",
-- "SUMMER2027" and "Summer 2027" are one code. Generated, so no write path can
-- store a code and a normalization that disagree.
--
-- Duration (Stripe semantics, periods = the instance's billing periods):
-- ONE_TIME applies to one invoice, REPEATING to duration_in_periods invoices,
-- FOREVER until revoked. For a boost, duration sets the effective window of
-- the redemption (instance_voucher.effective_expires_at).
--
-- PRICE: price_discount_value is a percentage in (0, 100] for PERCENTAGE, an
-- integer amount in minor units of currency for FIXED_AMOUNT (a fixed
-- discount carries its currency; it applies only to invoices in that
-- currency). Discount lines are composed by Kaiten on the invoices it issues;
-- no payment provider coupon is created.
--
-- Applicability: price_applies_to is the coarse scope; SELECTED_PRICES names
-- the license_price / addon_price ids it targets. applicable_license_ids /
-- applicable_addon_ids restrict redemption eligibility to those versions.
-- Arrays carry no foreign keys: the use case validates them against the
-- organization at write time.
--
-- restricted_customer_id: a voucher only that customer can redeem. CASCADE: a
-- voucher reserved for a deleted customer can be redeemed by nobody; that
-- customer's instances -- and so its redemptions -- are deleted in the same
-- statement.
--
-- redemption_rules: keys first_time_only, annual_only,
-- minimum_subscription_amount (application-validated object).
--
-- redemptions_count is advanced by the atomic conditional UPDATE of the
-- redemption (... WHERE max_redemptions IS NULL OR redemptions_count <
-- max_redemptions), in the transaction that inserts the instance_voucher; the
-- CHECK below is the backstop.
CREATE TABLE "voucher"
(
  "id"                           UUID                  NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"              UUID                  NOT NULL,
  "code"                         TEXT                  NOT NULL,
  "code_normalized"              TEXT                  GENERATED ALWAYS AS (upper(regexp_replace("code", '[^A-Za-z0-9]', '', 'g'))) STORED,
  "name"                         TEXT                  NOT NULL,
  "description"                  TEXT,
  "voucher_type"                 "voucher_type"        NOT NULL,
  "status"                       "voucher_status"      NOT NULL DEFAULT 'DRAFT',
  "duration"                     "voucher_duration"    NOT NULL,
  "duration_in_periods"          INTEGER,
  "max_redemptions"              INTEGER,
  "redemptions_count"            INTEGER               NOT NULL DEFAULT 0,
  "starts_at"                    TIMESTAMP(3),
  "expires_at"                   TIMESTAMP(3),
  "price_discount_type"          "price_discount_type",
  "price_discount_value"         NUMERIC(24, 12),
  "currency"                     CHAR(3),
  "price_applies_to"             "price_applies_to",
  "applicable_license_price_ids" UUID[]                NOT NULL DEFAULT '{}',
  "applicable_addon_price_ids"   UUID[]                NOT NULL DEFAULT '{}',
  "applicable_license_ids"       UUID[]                NOT NULL DEFAULT '{}',
  "applicable_addon_ids"         UUID[]                NOT NULL DEFAULT '{}',
  "restricted_customer_id"       UUID,
  "redemption_rules"             JSONB                 NOT NULL DEFAULT '{}'::jsonb,
  "created_at"                   TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"                UUID                  NOT NULL,
  "updated_at"                   TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"                UUID                  NOT NULL,

  CONSTRAINT "voucher_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voucher_id_organization_id_key" UNIQUE ("id", "organization_id"),
  -- Target of voucher_entitlement_grant's key, which pins grants to boosts.
  CONSTRAINT "voucher_id_voucher_type_organization_id_key" UNIQUE ("id", "voucher_type", "organization_id"),
  CONSTRAINT "voucher_organization_id_code_normalized_key" UNIQUE ("organization_id", "code_normalized"),
  CONSTRAINT "voucher_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "voucher_restricted_customer_id_fkey" FOREIGN KEY ("restricted_customer_id", "organization_id")
    REFERENCES "customer" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "voucher_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "voucher_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "voucher_code_check" CHECK ("code" ~ '^[A-Za-z0-9_-]{8,64}$'),
  CONSTRAINT "voucher_duration_check" CHECK (
    ("duration" = 'REPEATING') = ("duration_in_periods" IS NOT NULL)
      AND ("duration_in_periods" IS NULL OR "duration_in_periods" >= 1)
    ),
  CONSTRAINT "voucher_redemptions_check" CHECK (
    "redemptions_count" >= 0
      AND ("max_redemptions" IS NULL OR ("max_redemptions" >= 1 AND "redemptions_count" <= "max_redemptions"))
    ),
  CONSTRAINT "voucher_window_check" CHECK ("starts_at" IS NULL OR "expires_at" IS NULL OR "starts_at" < "expires_at"),
  CONSTRAINT "voucher_price_fields_check" CHECK (
    ("voucher_type" = 'PRICE'
      AND "price_discount_type" IS NOT NULL
      AND "price_discount_value" IS NOT NULL
      AND "price_applies_to" IS NOT NULL)
      OR
    ("voucher_type" = 'ENTITLEMENT_BOOST'
      AND "price_discount_type" IS NULL
      AND "price_discount_value" IS NULL
      AND "price_applies_to" IS NULL
      AND "currency" IS NULL
      AND cardinality("applicable_license_price_ids") = 0
      AND cardinality("applicable_addon_price_ids") = 0)
    ),
  CONSTRAINT "voucher_discount_value_check" CHECK (
    "price_discount_type" IS NULL
      OR
    ("price_discount_type" = 'PERCENTAGE' AND "price_discount_value" > 0 AND "price_discount_value" <= 100)
      OR
    ("price_discount_type" = 'FIXED_AMOUNT' AND "price_discount_value" > 0
      AND "price_discount_value" = trunc("price_discount_value"))
    ),
  CONSTRAINT "voucher_currency_check" CHECK (
    ("price_discount_type" IS NOT DISTINCT FROM 'FIXED_AMOUNT') = ("currency" IS NOT NULL)
      AND ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$')
    ),
  CONSTRAINT "voucher_selected_prices_check" CHECK (
    ("price_applies_to" IS NOT DISTINCT FROM 'SELECTED_PRICES')
      = (cardinality("applicable_license_price_ids") + cardinality("applicable_addon_price_ids") > 0)
    ),
  CONSTRAINT "voucher_arrays_no_null_check" CHECK (
    array_position("applicable_license_price_ids", NULL) IS NULL
      AND array_position("applicable_addon_price_ids", NULL) IS NULL
      AND array_position("applicable_license_ids", NULL) IS NULL
      AND array_position("applicable_addon_ids", NULL) IS NULL
    ),
  CONSTRAINT "voucher_redemption_rules_check" CHECK (jsonb_typeof("redemption_rules") = 'object')
);

CREATE INDEX "idx_voucher_org_created_at"
  ON "voucher" ("organization_id", "created_at" DESC, "id" DESC);
-- billing-lifecycle: ACTIVE vouchers whose redemption window has closed.
CREATE INDEX "idx_voucher_active_expires_at"
  ON "voucher" ("expires_at")
  WHERE "status" = 'ACTIVE' AND "expires_at" IS NOT NULL;
CREATE INDEX "idx_voucher_restricted_customer"
  ON "voucher" ("restricted_customer_id")
  WHERE "restricted_customer_id" IS NOT NULL;

-- The entitlement modifications of an ENTITLEMENT_BOOST voucher, relational:
-- an entitlement referenced by a boost cannot be deleted (RESTRICT), which a
-- JSON id could never guarantee.
--
-- voucher_type is pinned to ENTITLEMENT_BOOST and part of the foreign key, so
-- a PRICE voucher can never carry modifications. One modification per
-- (voucher, entitlement). SET >= 0, ADD > 0, MULTIPLY > 0, UNLIMITED carries
-- no value (it resolves to the -1 sentinel). Boosts apply to NUMBER and
-- NUMBER_AI_CREDIT entitlements only (checked by the use case, ignored by the
-- view otherwise).
CREATE TABLE "voucher_entitlement_grant"
(
  "id"              UUID                  NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID                  NOT NULL,
  "voucher_id"      UUID                  NOT NULL,
  "voucher_type"    "voucher_type"        NOT NULL DEFAULT 'ENTITLEMENT_BOOST',
  "entitlement_id"  UUID                  NOT NULL,
  "modifier_type"   "boost_modifier_type" NOT NULL,
  "modifier_value"  NUMERIC,
  "created_at"      TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "voucher_entitlement_grant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voucher_entitlement_grant_voucher_id_entitlement_id_key" UNIQUE ("voucher_id", "entitlement_id"),
  CONSTRAINT "voucher_entitlement_grant_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "voucher_entitlement_grant_voucher_id_fkey" FOREIGN KEY ("voucher_id", "voucher_type", "organization_id")
    REFERENCES "voucher" ("id", "voucher_type", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "voucher_entitlement_grant_entitlement_id_fkey" FOREIGN KEY ("entitlement_id", "organization_id")
    REFERENCES "entitlement" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "voucher_entitlement_grant_voucher_type_check" CHECK ("voucher_type" = 'ENTITLEMENT_BOOST'),
  CONSTRAINT "voucher_entitlement_grant_modifier_check" CHECK (
    ("modifier_type" = 'UNLIMITED' AND "modifier_value" IS NULL)
      OR ("modifier_type" = 'SET' AND "modifier_value" IS NOT NULL AND "modifier_value" >= 0)
      OR ("modifier_type" = 'ADD' AND "modifier_value" IS NOT NULL AND "modifier_value" > 0)
      OR ("modifier_type" = 'MULTIPLY' AND "modifier_value" IS NOT NULL AND "modifier_value" > 0)
    )
);

CREATE INDEX "idx_voucher_entitlement_grant_entitlement"
  ON "voucher_entitlement_grant" ("entitlement_id");

-- One redemption of a voucher by an instance (one per pair).
--
-- effective_starts_at / effective_expires_at: the window in which a boost
-- applies and a discount may be composed (NULL expiry = FOREVER). Effects are
-- lazy: the view and the composer check the window on every read;
-- billing-lifecycle only flips status to EXPIRED and emits the event.
-- applications_count counts the invoices a PRICE voucher produced a DISCOUNT
-- line on (ONE_TIME stops at 1, REPEATING at duration_in_periods).
-- Revocation keeps the row (history, past invoices untouched) and needs a
-- reason.
--
-- CASCADE from instance (entitlement state; invoice lines snapshot the voucher
-- id), RESTRICT towards voucher (a redeemed voucher is history: archive it).
CREATE TABLE "instance_voucher"
(
  "id"                   UUID                      NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"      UUID                      NOT NULL,
  "instance_id"          UUID                      NOT NULL,
  "voucher_id"           UUID                      NOT NULL,
  "redeemed_at"          TIMESTAMP(3)              NOT NULL,
  "redeemed_by_id"       UUID                      NOT NULL,
  "effective_starts_at"  TIMESTAMP(3)              NOT NULL,
  "effective_expires_at" TIMESTAMP(3),
  "applications_count"   INTEGER                   NOT NULL DEFAULT 0,
  "status"               "instance_voucher_status" NOT NULL DEFAULT 'ACTIVE',
  "expired_at"           TIMESTAMP(3),
  "revoked_at"           TIMESTAMP(3),
  "revoked_by_id"        UUID,
  "revoked_reason"       TEXT,
  "created_at"           TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "instance_voucher_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instance_voucher_instance_id_voucher_id_key" UNIQUE ("instance_id", "voucher_id"),
  CONSTRAINT "instance_voucher_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_voucher_instance_id_fkey" FOREIGN KEY ("instance_id", "organization_id")
    REFERENCES "instance" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_voucher_voucher_id_fkey" FOREIGN KEY ("voucher_id", "organization_id")
    REFERENCES "voucher" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_voucher_redeemed_by_id_fkey" FOREIGN KEY ("redeemed_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_voucher_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "instance_voucher_window_check" CHECK (
    "effective_expires_at" IS NULL OR "effective_starts_at" < "effective_expires_at"
    ),
  CONSTRAINT "instance_voucher_applications_count_check" CHECK ("applications_count" >= 0),
  CONSTRAINT "instance_voucher_revoked_check" CHECK (
    ("status" = 'REVOKED') = ("revoked_at" IS NOT NULL)
      AND ("revoked_at" IS NULL OR char_length(btrim(COALESCE("revoked_reason", ''))) > 0)
    ),
  CONSTRAINT "instance_voucher_expired_check" CHECK (("status" = 'EXPIRED') = ("expired_at" IS NOT NULL))
);

-- The boost layer of the effective view: an instance's ACTIVE redemptions.
CREATE INDEX "idx_instance_voucher_instance_active"
  ON "instance_voucher" ("instance_id", "voucher_id")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "idx_instance_voucher_voucher"
  ON "instance_voucher" ("voucher_id");
-- billing-lifecycle: ACTIVE redemptions whose window has closed.
CREATE INDEX "idx_instance_voucher_active_expires_at"
  ON "instance_voucher" ("effective_expires_at")
  WHERE "status" = 'ACTIVE' AND "effective_expires_at" IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "instance_voucher";
DROP TABLE IF EXISTS "voucher_entitlement_grant";
DROP TABLE IF EXISTS "voucher";
DROP TYPE IF EXISTS "instance_voucher_status";
DROP TYPE IF EXISTS "boost_modifier_type";
DROP TYPE IF EXISTS "price_applies_to";
DROP TYPE IF EXISTS "price_discount_type";
DROP TYPE IF EXISTS "voucher_duration";
DROP TYPE IF EXISTS "voucher_status";
DROP TYPE IF EXISTS "voucher_type";
-- +goose StatementEnd

