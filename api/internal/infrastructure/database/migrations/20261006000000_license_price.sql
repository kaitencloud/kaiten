-- +goose Up
-- +goose StatementBegin
-- The priced catalogue: licence commercial columns, public listing of a
-- family, and license_price.

CREATE TYPE "pricing_type" AS ENUM ('FREE', 'PAID', 'CUSTOM');
CREATE TYPE "billing_model" AS ENUM ('FLAT_FEE', 'USAGE_BASED', 'OVERAGE');
CREATE TYPE "billing_timing" AS ENUM ('ADVANCE', 'ARREARS');
CREATE TYPE "billing_period" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');
CREATE TYPE "price_status" AS ENUM ('ACTIVE', 'DEPRECATED');

-- Licence additions. pricing_type keeps its DEFAULT on purpose, unlike
-- lifecycle_state: the previous release still
-- inserts licences without the column during a rolling upgrade, and CUSTOM is
-- the value every pre-existing licence takes.
ALTER TABLE "license"
  ADD COLUMN "pricing_type"            "pricing_type" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "trial_period_days"       INTEGER,
  ADD COLUMN "requires_payment_method" BOOLEAN        NOT NULL DEFAULT FALSE,
  ADD COLUMN "self_serve_cta_url"      TEXT;

ALTER TABLE "license"
  ADD CONSTRAINT "license_trial_period_days_check" CHECK (
    "trial_period_days" IS NULL OR "trial_period_days" > 0
    );
ALTER TABLE "license"
  ADD CONSTRAINT "license_self_serve_cta_url_check" CHECK (
    "self_serve_cta_url" IS NULL
      OR
    ("self_serve_cta_url" ~ '^https?://[^[:space:]]+$' AND char_length("self_serve_cta_url") <= 2048)
    );

-- A family is listed in GET /public/catalog (its default PUBLISHED version)
-- only when the vendor marks it public; everything stays private by default.
ALTER TABLE "license_family" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX "idx_license_family_public"
  ON "license_family" ("organization_id")
  WHERE "is_public";

-- entitlement had no (id, organization_id) key: nothing referenced it
-- compositely until now (license_entitlement and entitlement_usage keep their
-- single-column keys). (id) is the primary key, so this cannot fail.
ALTER TABLE "entitlement"
  ADD CONSTRAINT "entitlement_id_organization_id_key" UNIQUE ("id", "organization_id");

-- One price = one billable concern = one invoice line. Prices hang on the
-- licence VERSION: an instance pinned to a version is pinned to its
-- prices, and a new commercial offer is a new version.
--
-- unit_amount_decimal is in MINOR units of currency (cents for EUR/USD, yen for
-- JPY), NUMERIC(24,12) so a per-token price such as 0.000002 USD = 0.0002 cents
-- is exact. FLAT_FEE: amount per period. USAGE_BASED / OVERAGE: amount
-- per SALE unit of the metered entitlement.
--
-- sale_unit_factor is snapshotted from entitlement.sale_unit_factor (1 when the
-- entitlement has no sale units) when the price is created: "1 sale unit = N
-- measured units". Editing the entitlement afterwards cannot reprice an
-- invoice.
--
-- The flow/stock rule (a metered entitlement must have reset_period IS
-- NOT NULL, aggregation_method IN (SUM, COUNT), type IN (NUMBER,
-- NUMBER_AI_CREDIT)) is checked by createlicenseprice and answered with 422
-- CreateLicensePrice.EntitlementIsStock / .UnsupportedAggregation /
-- .UnsupportedEntitlementType: it reads another table, and the application owns
-- the error codes. "Prices of a PUBLISHED version are immutable except
-- deprecation" is likewise a use-case rule.
--
-- ON DELETE CASCADE from license: a price has no existence outside its version.
-- A version that is in use cannot be deleted anyway (instance.license_id
-- RESTRICT); the subscriptions that later reference prices will RESTRICT their
-- deletion too.
CREATE TABLE "license_price"
(
  "id"                    UUID             NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"       UUID             NOT NULL,
  "license_id"            UUID             NOT NULL,
  "billing_model"         "billing_model"  NOT NULL,
  "billing_timing"        "billing_timing" NOT NULL,
  "billing_period"        "billing_period",
  "unit_amount_decimal"   NUMERIC(24, 12)  NOT NULL,
  "currency"              CHAR(3)          NOT NULL,
  "meters_entitlement_id" UUID,
  "sale_unit_factor"      NUMERIC,
  "display_label"         TEXT,
  "display_order"         INTEGER          NOT NULL DEFAULT 0,
  "is_default"            BOOLEAN          NOT NULL DEFAULT FALSE,
  "status"                "price_status"   NOT NULL DEFAULT 'ACTIVE',
  "deprecated_at"         TIMESTAMP(3),
  "created_at"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"         UUID             NOT NULL,
  "updated_at"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"         UUID             NOT NULL,

  CONSTRAINT "license_price_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "license_price_id_organization_id_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "license_price_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "license_price_license_id_fkey" FOREIGN KEY ("license_id", "organization_id")
    REFERENCES "license" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "license_price_meters_entitlement_id_fkey" FOREIGN KEY ("meters_entitlement_id", "organization_id")
    REFERENCES "entitlement" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "license_price_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "license_price_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- A metered price meters exactly one entitlement; a flat fee meters none.
  CONSTRAINT "license_price_meters_entitlement_check" CHECK (
    ("billing_model" IN ('USAGE_BASED', 'OVERAGE')) = ("meters_entitlement_id" IS NOT NULL)
    ),
  -- Consumption cannot be billed before it happens (prepaid credits are H2).
  CONSTRAINT "license_price_timing_check" CHECK (
    "billing_model" = 'FLAT_FEE' OR "billing_timing" = 'ARREARS'
    ),
  -- A flat fee has its own period; a metered price bills on the period of the
  -- subscription's base price.
  CONSTRAINT "license_price_period_check" CHECK (
    ("billing_model" = 'FLAT_FEE') = ("billing_period" IS NOT NULL)
    ),
  CONSTRAINT "license_price_sale_unit_factor_check" CHECK (
    ("billing_model" = 'FLAT_FEE' AND "sale_unit_factor" IS NULL)
      OR
    ("billing_model" IN ('USAGE_BASED', 'OVERAGE') AND "sale_unit_factor" IS NOT NULL AND "sale_unit_factor" > 0)
    ),
  CONSTRAINT "license_price_unit_amount_decimal_check" CHECK ("unit_amount_decimal" >= 0),
  CONSTRAINT "license_price_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "license_price_display_order_check" CHECK ("display_order" >= 0),
  -- The default price of a (version, period) is the one subscribe and the
  -- public catalogue pick; only a live flat fee can be it.
  CONSTRAINT "license_price_default_flat_fee_check" CHECK (
    NOT "is_default" OR ("billing_model" = 'FLAT_FEE' AND "status" = 'ACTIVE')
    ),
  CONSTRAINT "license_price_deprecated_at_check" CHECK (
    ("status" = 'DEPRECATED') = ("deprecated_at" IS NOT NULL)
    )
);

-- One default FLAT_FEE price per (version, billing_period).
CREATE UNIQUE INDEX "license_price_license_id_billing_period_default_key"
  ON "license_price" ("license_id", "billing_period")
  WHERE "is_default";

-- A version's prices in display order (catalogue, composer, public catalog).
CREATE INDEX "idx_license_price_license_display_order"
  ON "license_price" ("license_id", "display_order", "id");

-- GET /licenses/{slug}/prices keysets like every list endpoint.
CREATE INDEX "idx_license_price_org_created_at"
  ON "license_price" ("organization_id", "created_at" DESC, "id" DESC);

-- "Is this entitlement metered by a price?" (entitlement delete RESTRICT check,
-- reset_period/aggregation edit guards).
CREATE INDEX "idx_license_price_meters_entitlement"
  ON "license_price" ("meters_entitlement_id")
  WHERE "meters_entitlement_id" IS NOT NULL;

-- One currency per licence version. Cross-row, so a trigger rather than
-- a CHECK. The version row is locked FOR NO KEY UPDATE first -- the mode that
-- does not conflict with the FOR KEY SHARE of foreign-key checks -- so two
-- concurrent price writes on one version serialize and the second one sees the
-- first one's currency. AFTER, not BEFORE, for the lock-escalation reason of
-- 20260902000000. The error names a constraint so createlicenseprice maps it
-- to 422 CreateLicensePrice.CurrencyMismatch without parsing the message.
CREATE FUNCTION license_price_single_currency()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
DECLARE
  other_currency CHAR(3);
BEGIN
PERFORM 1
FROM public."license" l
WHERE l."id" = NEW."license_id"
  AND l."organization_id" = NEW."organization_id"
FOR NO KEY UPDATE;
SELECT p."currency"
INTO other_currency
FROM public."license_price" p
WHERE p."license_id" = NEW."license_id"
  AND p."id" <> NEW."id"
  AND p."currency" <> NEW."currency"
LIMIT 1;
IF other_currency IS NOT NULL THEN
  RAISE EXCEPTION 'license % already has prices in %, cannot add %', NEW."license_id", other_currency, NEW."currency"
    USING ERRCODE = 'check_violation', CONSTRAINT = 'license_price_single_currency';
END IF;
RETURN NEW;
END;
$$;

CREATE TRIGGER "license_price_single_currency_trigger"
  AFTER INSERT OR UPDATE OF "currency", "license_id" ON "license_price"
  FOR EACH ROW EXECUTE FUNCTION license_price_single_currency();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS "license_price_single_currency_trigger" ON "license_price";
DROP FUNCTION IF EXISTS license_price_single_currency();
DROP TABLE IF EXISTS "license_price";
ALTER TABLE "entitlement" DROP CONSTRAINT IF EXISTS "entitlement_id_organization_id_key";
DROP INDEX IF EXISTS "idx_license_family_public";
ALTER TABLE "license_family" DROP COLUMN IF EXISTS "is_public";
ALTER TABLE "license" DROP CONSTRAINT IF EXISTS "license_self_serve_cta_url_check";
ALTER TABLE "license" DROP CONSTRAINT IF EXISTS "license_trial_period_days_check";
ALTER TABLE "license"
  DROP COLUMN IF EXISTS "self_serve_cta_url",
  DROP COLUMN IF EXISTS "requires_payment_method",
  DROP COLUMN IF EXISTS "trial_period_days",
  DROP COLUMN IF EXISTS "pricing_type";
DROP TYPE IF EXISTS "price_status";
DROP TYPE IF EXISTS "billing_period";
DROP TYPE IF EXISTS "billing_timing";
DROP TYPE IF EXISTS "billing_model";
DROP TYPE IF EXISTS "pricing_type";
-- +goose StatementEnd
