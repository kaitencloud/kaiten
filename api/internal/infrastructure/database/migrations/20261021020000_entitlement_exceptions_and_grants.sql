-- +goose Up
-- +goose StatementBegin
-- Exceptions, BOOLEAN and CONFIG boosts, FLAG_GRANT and COMPOSITE vouchers
-- (V32-03), and the billing-period reset anchor (V32-04). They use the values
-- 20261021000000 added. The view is untouched here (20261021030000).

-- GiST equality on UUID, for the exclusion constraint of
-- instance_entitlement_exception: the schema's first extension. Trusted since
-- PostgreSQL 13, so the role that runs the migrations creates it with CREATE
-- on the database. The Down keeps it: another object may use it by then.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- The vendor's explicit decision on one entitlement of one instance, for a
-- window and without a code (V32-03 a): the last layer of the effective view
-- (INV-38). An entitlement feature, independent of billing.
--
-- value: the raw value, not the {type, value} wrapper -- a JSON number for
-- NUMBER and NUMBER_AI_CREDIT, a JSON boolean for BOOLEAN, the CONFIG document
-- as an object; NULL exactly for UNLIMITED. ADD is a number > 0, a SET number
-- is >= 0 (unlimited is the kind UNLIMITED, never -1). The use case matches
-- the JSON type and the kind to entitlement.type.
-- starts_at: the creation instant by default, never before it (use case); a
-- future start is a scheduled exception. ends_at NULL: no end.
-- revoked_at / revoked_by_id: DELETE .../{id} revokes and keeps the row; the
-- author is kept (RESTRICT), as on publishable_key.
-- expired_notified_at: the once-only marker of the .expired event, set by
-- billing-lifecycle step (g).
--
-- One active exception per (instance, entitlement) at any instant (INV-37):
-- the exclusion constraint compares the time ranges of the rows that are not
-- revoked. Ended rows stay inside it, harmlessly, since a new window never
-- starts before its creation. Its GiST index also serves the view's lookup of
-- the pair at the evaluation instant.
--
-- CASCADE from instance (entitlement state of the instance, like its
-- attachments and redemptions) and from entitlement: an exception overrides
-- an entitlement and its rows are never deleted otherwise, so a RESTRICT would
-- block the entitlement's deletion for ever.
CREATE TABLE "instance_entitlement_exception"
(
  "id"                  UUID                         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"     UUID                         NOT NULL,
  "instance_id"         UUID                         NOT NULL,
  "entitlement_id"      UUID                         NOT NULL,
  "kind"                "entitlement_exception_kind" NOT NULL,
  "value"               JSONB,
  "starts_at"           TIMESTAMP(3)                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at"             TIMESTAMP(3),
  "reason"              TEXT                         NOT NULL,
  "created_at"          TIMESTAMP(3)                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"       UUID                         NOT NULL,
  "revoked_at"          TIMESTAMP(3),
  "revoked_by_id"       UUID,
  "expired_notified_at" TIMESTAMP(3),

  CONSTRAINT "instance_entitlement_exception_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instance_entitlement_exception_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_entitlement_exception_instance_id_fkey" FOREIGN KEY ("instance_id", "organization_id")
    REFERENCES "instance" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_entitlement_exception_entitlement_id_fkey" FOREIGN KEY ("entitlement_id", "organization_id")
    REFERENCES "entitlement" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_entitlement_exception_created_by_id_fkey" FOREIGN KEY ("created_by_id")
    REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_entitlement_exception_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id")
    REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- CASE, not AND: SQL does not promise to skip the cast of a non-number.
  CONSTRAINT "instance_entitlement_exception_value_check" CHECK (
    ("kind" = 'UNLIMITED') = ("value" IS NULL)
      AND CASE
            WHEN "value" IS NULL THEN TRUE
            WHEN jsonb_typeof("value") = 'number' THEN
              CASE WHEN "kind" = 'ADD' THEN ("value" #>> '{}')::numeric > 0
                   ELSE ("value" #>> '{}')::numeric >= 0 END
            WHEN jsonb_typeof("value") IN ('boolean', 'object') THEN "kind" = 'SET'
            ELSE FALSE
          END
    ),
  CONSTRAINT "instance_entitlement_exception_window_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
  CONSTRAINT "instance_entitlement_exception_reason_check" CHECK (
    char_length("reason") BETWEEN 1 AND 500 AND char_length(btrim("reason")) > 0
    ),
  CONSTRAINT "instance_entitlement_exception_revoked_check" CHECK (("revoked_at" IS NULL) = ("revoked_by_id" IS NULL)),
  CONSTRAINT "instance_entitlement_exception_expired_notified_check" CHECK (
    "expired_notified_at" IS NULL OR "ends_at" IS NOT NULL
    ),
  CONSTRAINT "instance_entitlement_exception_window_excl" EXCLUDE USING gist (
    "instance_id" WITH =,
    "entitlement_id" WITH =,
    tsrange("starts_at", "ends_at", '[)') WITH &&
    ) WHERE ("revoked_at" IS NULL)
);

-- The list route (startsAt descending, then id) and the instance CASCADE.
CREATE INDEX "idx_instance_entitlement_exception_instance_starts_at"
  ON "instance_entitlement_exception" ("instance_id", "starts_at" DESC, "id" DESC);
-- The entitlement CASCADE.
CREATE INDEX "idx_instance_entitlement_exception_entitlement"
  ON "instance_entitlement_exception" ("entitlement_id");
-- billing-lifecycle step (g): ended exceptions not announced yet.
CREATE INDEX "idx_instance_entitlement_exception_expiry"
  ON "instance_entitlement_exception" ("ends_at")
  WHERE "revoked_at" IS NULL AND "ends_at" IS NOT NULL AND "expired_notified_at" IS NULL;

-- The target of voucher_flag_grant's composite foreign key. Cannot fail: id is
-- the primary key.
ALTER TABLE "feature_flags"
  ADD CONSTRAINT "feature_flags_id_organization_id_key" UNIQUE ("id", "organization_id");

-- The flag variants a FLAG_GRANT voucher, or the flag part of a COMPOSITE one,
-- grants (V32-03 c), one row per flag. voucher_type is part of the foreign key
-- (the key boost grants already target) and pinned by the CHECK, so a PRICE or
-- ENTITLEMENT_BOOST voucher can never carry a flag grant. RESTRICT towards
-- the flag: a granted flag cannot be deleted (409
-- DeleteFeatureFlag.InUseConflict); disabling it stays possible, and the kill
-- switch wins over the grant. The flag evaluator reads these rows through
-- instance_voucher, never through the effective view. variant is checked
-- against the flag's variants by the use case; a grant whose variant the flag
-- no longer defines is skipped at evaluation.
CREATE TABLE "voucher_flag_grant"
(
  "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID           NOT NULL,
  "voucher_id"      UUID           NOT NULL,
  "voucher_type"    "voucher_type" NOT NULL,
  "flag_id"         UUID           NOT NULL,
  "variant"         TEXT           NOT NULL,
  "created_at"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "voucher_flag_grant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voucher_flag_grant_voucher_id_flag_id_key" UNIQUE ("voucher_id", "flag_id"),
  CONSTRAINT "voucher_flag_grant_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "voucher_flag_grant_voucher_id_fkey" FOREIGN KEY ("voucher_id", "voucher_type", "organization_id")
    REFERENCES "voucher" ("id", "voucher_type", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "voucher_flag_grant_flag_id_fkey" FOREIGN KEY ("flag_id", "organization_id")
    REFERENCES "feature_flags" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "voucher_flag_grant_voucher_type_check" CHECK ("voucher_type" IN ('FLAG_GRANT', 'COMPOSITE')),
  CONSTRAINT "voucher_flag_grant_variant_check" CHECK (char_length("variant") BETWEEN 1 AND 255)
);

-- The RESTRICT check on flag delete, and the evaluator's join.
CREATE INDEX "idx_voucher_flag_grant_flag"
  ON "voucher_flag_grant" ("flag_id");

-- BOOLEAN and CONFIG boosts (V32-03 b): a SET carries either modifier_value
-- (NUMBER and NUMBER_AI_CREDIT) or value (a JSON boolean, or the CONFIG
-- document as an object); ADD, MULTIPLY and UNLIMITED never carry value. The
-- use case matches the column to entitlement.type. A COMPOSITE voucher's boost
-- part carries grants too.
ALTER TABLE "voucher_entitlement_grant" ADD COLUMN "value" JSONB;
ALTER TABLE "voucher_entitlement_grant" DROP CONSTRAINT "voucher_entitlement_grant_voucher_type_check";
ALTER TABLE "voucher_entitlement_grant"
  ADD CONSTRAINT "voucher_entitlement_grant_voucher_type_check" CHECK ("voucher_type" IN ('ENTITLEMENT_BOOST', 'COMPOSITE'));
ALTER TABLE "voucher_entitlement_grant" DROP CONSTRAINT "voucher_entitlement_grant_modifier_check";
ALTER TABLE "voucher_entitlement_grant"
  ADD CONSTRAINT "voucher_entitlement_grant_modifier_check" CHECK (
    ("modifier_type" = 'UNLIMITED' AND "modifier_value" IS NULL AND "value" IS NULL)
      OR ("modifier_type" = 'SET' AND "modifier_value" IS NOT NULL AND "modifier_value" >= 0 AND "value" IS NULL)
      OR ("modifier_type" = 'SET' AND "modifier_value" IS NULL AND "value" IS NOT NULL
          AND jsonb_typeof("value") IN ('boolean', 'object'))
      OR ("modifier_type" = 'ADD' AND "modifier_value" IS NOT NULL AND "modifier_value" > 0 AND "value" IS NULL)
      OR ("modifier_type" = 'MULTIPLY' AND "modifier_value" IS NOT NULL AND "modifier_value" > 0 AND "value" IS NULL)
    );

-- The price columns: required for PRICE, absent for ENTITLEMENT_BOOST and
-- FLAG_GRANT, all present or all absent for COMPOSITE (the use case requires
-- at least two of its three parts). Absent price columns keep the price-id
-- arrays empty.
ALTER TABLE "voucher" DROP CONSTRAINT "voucher_price_fields_check";
ALTER TABLE "voucher"
  ADD CONSTRAINT "voucher_price_fields_check" CHECK (
    ("voucher_type" IN ('PRICE', 'COMPOSITE')
      AND "price_discount_type" IS NOT NULL
      AND "price_discount_value" IS NOT NULL
      AND "price_applies_to" IS NOT NULL)
      OR
    ("voucher_type" IN ('ENTITLEMENT_BOOST', 'FLAG_GRANT', 'COMPOSITE')
      AND "price_discount_type" IS NULL
      AND "price_discount_value" IS NULL
      AND "price_applies_to" IS NULL
      AND "currency" IS NULL
      AND cardinality("applicable_license_price_ids") = 0
      AND cardinality("applicable_addon_price_ids") = 0)
    );

-- BILLING_PERIOD windows follow the billing periods, so they exist for MONTH
-- and YEAR only (V32-04; 422 .InvalidResetAnchor).
ALTER TABLE "entitlement"
  ADD CONSTRAINT "entitlement_reset_anchor_billing_period_check" CHECK (
    "reset_anchor" IS DISTINCT FROM 'BILLING_PERIOD' OR "reset_period" IN ('MONTH', 'YEAR')
    );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Every v3.2 object of this migration holds a vendor decision that the earlier
-- schema cannot represent: the Down refuses while one exists, then drops the
-- objects and restores the constraints of 20261016090000 verbatim. The
-- extension stays.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "instance_entitlement_exception") THEN
    RAISE EXCEPTION 'instance_entitlement_exception has rows; delete them before rolling back 20261021020000';
  END IF;
  IF EXISTS (SELECT 1 FROM "voucher_flag_grant") THEN
    RAISE EXCEPTION 'voucher_flag_grant has rows; delete them before rolling back 20261021020000';
  END IF;
  IF EXISTS (SELECT 1 FROM "voucher_entitlement_grant" WHERE "value" IS NOT NULL) THEN
    RAISE EXCEPTION 'voucher_entitlement_grant has BOOLEAN or CONFIG boosts; delete them before rolling back 20261021020000';
  END IF;
  IF EXISTS (SELECT 1 FROM "voucher" WHERE "voucher_type" IN ('FLAG_GRANT', 'COMPOSITE')) THEN
    RAISE EXCEPTION 'voucher has FLAG_GRANT or COMPOSITE rows; delete them before rolling back 20261021020000';
  END IF;
  IF EXISTS (SELECT 1 FROM "entitlement" WHERE "reset_anchor" = 'BILLING_PERIOD') THEN
    RAISE EXCEPTION 'entitlement has BILLING_PERIOD anchors; move them to another anchor before rolling back 20261021020000';
  END IF;
END $$;

ALTER TABLE "entitlement" DROP CONSTRAINT IF EXISTS "entitlement_reset_anchor_billing_period_check";

ALTER TABLE "voucher" DROP CONSTRAINT IF EXISTS "voucher_price_fields_check";
ALTER TABLE "voucher"
  ADD CONSTRAINT "voucher_price_fields_check" CHECK (
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
    );

ALTER TABLE "voucher_entitlement_grant" DROP CONSTRAINT IF EXISTS "voucher_entitlement_grant_modifier_check";
ALTER TABLE "voucher_entitlement_grant"
  ADD CONSTRAINT "voucher_entitlement_grant_modifier_check" CHECK (
    ("modifier_type" = 'UNLIMITED' AND "modifier_value" IS NULL)
      OR ("modifier_type" = 'SET' AND "modifier_value" IS NOT NULL AND "modifier_value" >= 0)
      OR ("modifier_type" = 'ADD' AND "modifier_value" IS NOT NULL AND "modifier_value" > 0)
      OR ("modifier_type" = 'MULTIPLY' AND "modifier_value" IS NOT NULL AND "modifier_value" > 0)
    );
ALTER TABLE "voucher_entitlement_grant" DROP CONSTRAINT IF EXISTS "voucher_entitlement_grant_voucher_type_check";
ALTER TABLE "voucher_entitlement_grant"
  ADD CONSTRAINT "voucher_entitlement_grant_voucher_type_check" CHECK ("voucher_type" = 'ENTITLEMENT_BOOST');
ALTER TABLE "voucher_entitlement_grant" DROP COLUMN IF EXISTS "value";

DROP TABLE IF EXISTS "voucher_flag_grant";
ALTER TABLE "feature_flags" DROP CONSTRAINT IF EXISTS "feature_flags_id_organization_id_key";

DROP TABLE IF EXISTS "instance_entitlement_exception";
-- +goose StatementEnd
