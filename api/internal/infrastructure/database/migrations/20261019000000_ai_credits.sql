-- +goose Up
-- +goose StatementBegin
-- AI credits (KTN-201): a model catalogue, conversion rules that price a
-- model's usage in a credit pool per licence version, and ai_inference, the
-- one operation record of an AI report -- created RESERVED by a reserve,
-- closed exactly once by its commit (COMMITTED, or RELEASED when the
-- provider was never reached) or by the maintenance sweep (EXPIRED).
--
-- Purely additive: entitlement_type already carries NUMBER_AI_CREDIT and no
-- existing CHECK is touched. The one new rule on an existing table is that a
-- credit pool aggregates by SUM; it fails loudly on a violating row instead of
-- coercing it.

-- The composite foreign keys below need UNIQUE ("id", "organization_id") on
-- entitlement and on instance. feat/billing adds the same two keys under the
-- same names; each side guards its ADD so the two migrations apply in either
-- order.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'entitlement_id_organization_id_key') THEN
    ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_id_organization_id_key" UNIQUE ("id", "organization_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'instance_id_organization_id_key') THEN
    ALTER TABLE "instance" ADD CONSTRAINT "instance_id_organization_id_key" UNIQUE ("id", "organization_id");
  END IF;
END
$$;

-- A credit pool's counter only ever moves by + and - appends.
ALTER TABLE "entitlement" ADD CONSTRAINT "entitlement_ai_credit_sum_check"
  CHECK ("type" <> 'NUMBER_AI_CREDIT' OR "aggregation_method" = 'SUM');

CREATE TYPE "model_modality" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'EMBEDDING', 'MULTIMODAL');
CREATE TYPE "model_status" AS ENUM ('ACTIVE', 'DEPRECATED', 'ARCHIVED');
CREATE TYPE "ai_request_type" AS ENUM ('COMPLETION', 'EMBEDDING', 'IMAGE_GENERATION', 'AUDIO', 'VIDEO');
CREATE TYPE "ai_request_status" AS ENUM ('SUCCESS', 'PROVIDER_ERROR', 'CUSTOMER_ERROR', 'NOT_SENT');
CREATE TYPE "charge_on_error_policy" AS ENUM ('NEVER', 'ALWAYS', 'PROVIDER_ERROR_ONLY');
CREATE TYPE "credit_conversion_rule_status" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "ai_inference_status" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED');

CREATE TABLE "model"
(
  "id"                                 UUID             NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"                    UUID             NOT NULL,
  "name"                               TEXT             NOT NULL,
  "slug"                               TEXT             NOT NULL,
  "description"                        TEXT,
  "vendor"                             TEXT             NOT NULL,
  "modality"                           "model_modality" NOT NULL,
  "status"                             "model_status"   NOT NULL DEFAULT 'ACTIVE',
  "vendor_cost_per_input_token"        NUMERIC(18, 12),
  "vendor_cost_per_cached_input_token" NUMERIC(18, 12),
  "vendor_cost_per_cache_write_token"  NUMERIC(18, 12),
  "vendor_cost_per_output_token"       NUMERIC(18, 12),
  "vendor_cost_per_request"            NUMERIC(18, 12),
  "vendor_cost_per_unit"               NUMERIC(18, 12),
  "vendor_cost_currency"               CHAR(3)          NOT NULL DEFAULT 'USD',
  "metadata"                           JSONB            NOT NULL DEFAULT '{}',
  "created_at"                         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"                      UUID             NOT NULL,
  "updated_at"                         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"                      UUID             NOT NULL,

  CONSTRAINT "model_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "model_id_organization_id_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "model_organization_id_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "model_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "model_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "model_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "model_vendor_cost_currency_check" CHECK ("vendor_cost_currency" = 'USD'),
  CONSTRAINT "model_vendor_costs_check" CHECK (
    COALESCE("vendor_cost_per_input_token", 0) >= 0 AND COALESCE("vendor_cost_per_cached_input_token", 0) >= 0
      AND COALESCE("vendor_cost_per_cache_write_token", 0) >= 0 AND COALESCE("vendor_cost_per_output_token", 0) >= 0
      AND COALESCE("vendor_cost_per_request", 0) >= 0 AND COALESCE("vendor_cost_per_unit", 0) >= 0)
);

CREATE INDEX "idx_model_org_created_at" ON "model" ("organization_id", "created_at" DESC, "id" DESC);

-- The ids a provider knows a model by ("gpt-4o-2024-11-20", "gpt-4o"). A
-- catalogue model takes several; an id belongs to one model of the
-- organization. Resolution tries the slug first, so the use case refuses an
-- external id equal to another model's slug.
CREATE TABLE "model_external_id"
(
  "organization_id" UUID         NOT NULL,
  "external_id"     TEXT         NOT NULL,
  "model_id"        UUID         NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "model_external_id_pkey" PRIMARY KEY ("organization_id", "external_id"),
  CONSTRAINT "model_external_id_model_id_fkey" FOREIGN KEY ("model_id", "organization_id")
    REFERENCES "model" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "model_external_id_length_check" CHECK (char_length("external_id") BETWEEN 1 AND 255)
);

CREATE INDEX "idx_model_external_id_model" ON "model_external_id" ("model_id");

-- A rule is a price vector, not a conversion type: credits_computed is the sum
-- of rate x quantity over the dimensions that carry a rate. Its identity is
-- (licence version, pool, model or any, request type or any); it references
-- the licence and the entitlement separately, never the grant row, so
-- removing and re-adding a grant loses no rule.
CREATE TABLE "credit_conversion_rule"
(
  "id"                          UUID                            NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"             UUID                            NOT NULL,
  "license_id"                  UUID                            NOT NULL,
  "entitlement_id"              UUID                            NOT NULL,
  "model_id"                    UUID,             -- NULL = any catalogue model that is not ARCHIVED
  "request_type"                "ai_request_type", -- NULL = every request type
  "rate_per_request"            NUMERIC(18, 10),
  "rate_per_input_token"        NUMERIC(18, 10),
  "rate_per_cached_input_token" NUMERIC(18, 10),  -- NULL = the input rate
  "rate_per_cache_write_token"  NUMERIC(18, 10),  -- NULL = the input rate
  "rate_per_output_token"       NUMERIC(18, 10),
  "rate_per_unit"               NUMERIC(18, 10),
  "rate_per_second"             NUMERIC(18, 10),
  "minimum_credits_per_request" NUMERIC(18, 6)                  NOT NULL DEFAULT 0,
  "maximum_credits_per_request" NUMERIC(18, 6),
  "charge_on_error"             "charge_on_error_policy"        NOT NULL DEFAULT 'NEVER',
  "status"                      "credit_conversion_rule_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at"                  TIMESTAMP(3)                    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"               UUID                            NOT NULL,
  "updated_at"                  TIMESTAMP(3)                    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"               UUID                            NOT NULL,

  CONSTRAINT "credit_conversion_rule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ccr_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ccr_license_id_fkey" FOREIGN KEY ("license_id", "organization_id")
    REFERENCES "license" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ccr_entitlement_id_fkey" FOREIGN KEY ("entitlement_id", "organization_id")
    REFERENCES "entitlement" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ccr_model_id_fkey" FOREIGN KEY ("model_id", "organization_id")
    REFERENCES "model" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ccr_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ccr_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ccr_rate_present_check" CHECK (
    "rate_per_request" IS NOT NULL OR "rate_per_input_token" IS NOT NULL
      OR "rate_per_cached_input_token" IS NOT NULL OR "rate_per_cache_write_token" IS NOT NULL
      OR "rate_per_output_token" IS NOT NULL OR "rate_per_unit" IS NOT NULL OR "rate_per_second" IS NOT NULL),
  CONSTRAINT "ccr_nonnegative_check" CHECK (
    COALESCE("rate_per_request", 0) >= 0 AND COALESCE("rate_per_input_token", 0) >= 0
      AND COALESCE("rate_per_cached_input_token", 0) >= 0 AND COALESCE("rate_per_cache_write_token", 0) >= 0
      AND COALESCE("rate_per_output_token", 0) >= 0 AND COALESCE("rate_per_unit", 0) >= 0
      AND COALESCE("rate_per_second", 0) >= 0 AND "minimum_credits_per_request" >= 0),
  CONSTRAINT "ccr_min_max_check" CHECK (
    "maximum_credits_per_request" IS NULL OR "maximum_credits_per_request" >= "minimum_credits_per_request")
);

-- At most one ACTIVE rule per identity: one index per NULL combination.
CREATE UNIQUE INDEX "ccr_active_model_type_key" ON "credit_conversion_rule" ("license_id", "entitlement_id", "model_id", "request_type")
  WHERE "status" = 'ACTIVE' AND "model_id" IS NOT NULL AND "request_type" IS NOT NULL;
CREATE UNIQUE INDEX "ccr_active_model_key" ON "credit_conversion_rule" ("license_id", "entitlement_id", "model_id")
  WHERE "status" = 'ACTIVE' AND "model_id" IS NOT NULL AND "request_type" IS NULL;
CREATE UNIQUE INDEX "ccr_active_type_key" ON "credit_conversion_rule" ("license_id", "entitlement_id", "request_type")
  WHERE "status" = 'ACTIVE' AND "model_id" IS NULL AND "request_type" IS NOT NULL;
CREATE UNIQUE INDEX "ccr_active_any_key" ON "credit_conversion_rule" ("license_id", "entitlement_id")
  WHERE "status" = 'ACTIVE' AND "model_id" IS NULL AND "request_type" IS NULL;
CREATE INDEX "idx_ccr_model" ON "credit_conversion_rule" ("model_id") WHERE "model_id" IS NOT NULL;

-- One row per AI operation of a pool. Insert-once, close-once: reserve
-- inserts it RESERVED; commit (or a commit with no reservation, which inserts
-- it COMMITTED directly) and the sweep close it. It is evidence, not
-- balance: entitlement_usage stays the source of truth for the counter, and
-- value_before/value_after only snapshot it around the charge. No foreign key
-- but organization, so the record outlives the instance, the pool, the model
-- and the rule.
--
-- A plain table, not monthly partitions: billing's partition helper is not
-- on main yet. Repartitioning later is one migration.
CREATE TABLE "ai_inference"
(
  "id"                        UUID                  NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"           UUID                  NOT NULL,
  "instance_id"               UUID                  NOT NULL,
  "entitlement_id"            UUID                  NOT NULL,
  "transaction_id"            TEXT                  NOT NULL,
  "status"                    "ai_inference_status" NOT NULL,
  "reported_at"               TIMESTAMP(3)          NOT NULL, -- the report's clock when the row was created
  "committed_at"              TIMESTAMP(3),
  "expires_at"                TIMESTAMP(3),                   -- NULL when created by a commit

  "model_ref"                 TEXT                  NOT NULL, -- the model as sent
  "model_id"                  UUID,                           -- NULL = not in the catalogue
  "request_type"              "ai_request_type"     NOT NULL,
  "request_status"            "ai_request_status",            -- NULL while RESERVED
  "input_tokens"              BIGINT,
  "cache_read_input_tokens"   BIGINT,
  "cache_write_input_tokens"  BIGINT,
  "output_tokens"             BIGINT,
  "units"                     NUMERIC(18, 6),
  "unit_type"                 TEXT,
  "duration_ms"               BIGINT,

  "credit_conversion_rule_id" UUID,
  "authorized"                BOOLEAN,                        -- NULL while RESERVED
  "denial_reason"             TEXT,                           -- UNKNOWN_MODEL | MODEL_ARCHIVED | NO_RULE
  "credits_reserved"          NUMERIC(20, 6),                 -- NULL when the operation never reserved
  "credits_computed"          NUMERIC(20, 6),
  "credits_charged"           NUMERIC(20, 6),

  "value_before"              DOUBLE PRECISION,               -- the counter around the charge; NULL when nothing was charged
  "value_after"               DOUBLE PRECISION,
  "window_start"              TIMESTAMP(3),                   -- NULL = lifetime pool

  "request_hash"              BYTEA                 NOT NULL, -- of the phase that created the row
  "commit_hash"               BYTEA,                          -- of the commit that closed it

  CONSTRAINT "ai_inference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_inference_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_inference_reserved_check" CHECK (
    "status" <> 'RESERVED' OR ("credits_reserved" IS NOT NULL AND "expires_at" IS NOT NULL AND "committed_at" IS NULL)),
  CONSTRAINT "ai_inference_committed_check" CHECK (
    "status" NOT IN ('COMMITTED', 'RELEASED')
      OR ("committed_at" IS NOT NULL AND "request_status" IS NOT NULL AND "authorized" IS NOT NULL AND "credits_charged" IS NOT NULL)),
  CONSTRAINT "ai_inference_charge_check" CHECK (
    (("credits_charged" IS NULL OR "credits_charged" = 0) AND "value_before" IS NULL AND "value_after" IS NULL)
      OR (COALESCE("credits_charged", 0) > 0 AND "value_before" IS NOT NULL AND "value_after" IS NOT NULL)),
  CONSTRAINT "ai_inference_authorized_check" CHECK (
    "authorized" IS NULL OR "authorized" = ("denial_reason" IS NULL)),
  CONSTRAINT "ai_inference_nonnegative_check" CHECK (
    COALESCE("input_tokens", 0) >= 0 AND COALESCE("cache_read_input_tokens", 0) >= 0
      AND COALESCE("cache_write_input_tokens", 0) >= 0 AND COALESCE("output_tokens", 0) >= 0
      AND COALESCE("units", 0) >= 0 AND COALESCE("duration_ms", 0) >= 0
      AND COALESCE("credits_reserved", 0) >= 0 AND COALESCE("credits_computed", 0) >= 0
      AND COALESCE("credits_charged", 0) >= 0)
);

-- The gate's sum of open reservations, under the pair's lock: index-only.
CREATE INDEX "idx_ai_inference_reserved" ON "ai_inference" ("instance_id", "entitlement_id")
  INCLUDE ("credits_reserved", "expires_at") WHERE "status" = 'RESERVED';
-- The sweep: reservations past their expiry.
CREATE INDEX "idx_ai_inference_expires_at" ON "ai_inference" ("expires_at") WHERE "status" = 'RESERVED';
-- The transactionId lookup, under the pair's lock. Not unique: a key is
-- remembered for KAITEN_USAGE_IDEMPOTENCY_WINDOW only, and an older one is a
-- new operation. Uniqueness inside the window comes from the lookup running
-- under the pair's lock.
CREATE INDEX "idx_ai_inference_transaction" ON "ai_inference" ("instance_id", "entitlement_id", "transaction_id", "reported_at" DESC);
-- The pool's history, newest first.
CREATE INDEX "idx_ai_inference_pair_reported_at" ON "ai_inference" ("instance_id", "entitlement_id", "reported_at");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE "ai_inference";
DROP TABLE "credit_conversion_rule";
DROP TABLE "model_external_id";
DROP TABLE "model";
DROP TYPE "ai_inference_status";
DROP TYPE "credit_conversion_rule_status";
DROP TYPE "charge_on_error_policy";
DROP TYPE "ai_request_status";
DROP TYPE "ai_request_type";
DROP TYPE "model_status";
DROP TYPE "model_modality";
ALTER TABLE "entitlement" DROP CONSTRAINT "entitlement_ai_credit_sum_check";
-- The two composite unique keys stay: feat/billing's foreign keys may depend
-- on them, and an unused unique key on a primary key column costs nothing.
-- +goose StatementEnd
