-- +goose Up
-- +goose StatementBegin
-- The enum values and types of v3.2 (V32-01, V32-03, V32-04), alone in their
-- migration: PostgreSQL cannot use a value added by ALTER TYPE ... ADD VALUE
-- in the transaction that adds it, and 20261021020000 uses all three (CHECK
-- constraints of voucher, voucher_entitlement_grant, voucher_flag_grant and
-- entitlement). The two new types are created here too, so that every v3.2
-- enum lives in one migration; 20261021010000 and 20261021020000 use them.
--
-- FLAG_GRANT: a voucher that grants flag variants (voucher_flag_grant).
-- COMPOSITE: a voucher that carries at least two of a PRICE part, boost
-- grants and flag grants, applied by one redemption (V32-03 c, d).
ALTER TYPE "voucher_type" ADD VALUE 'FLAG_GRANT';
ALTER TYPE "voucher_type" ADD VALUE 'COMPOSITE';

-- BILLING_PERIOD: reset windows aligned on instance_billing.anchor_at while
-- the instance has a live subscription, LICENSE_START otherwise (V32-04).
-- main's type, extended; valid with reset_period MONTH or YEAR only
-- (entitlement_reset_anchor_billing_period_check, 20261021020000).
ALTER TYPE "entitlement_reset_anchor" ADD VALUE 'BILLING_PERIOD';

-- The lifecycle of an anonymous checkout (V32-01): OPEN at the start;
-- AWAITING_PAYMENT once the setup created an INCOMPLETE subscription;
-- COMPLETED, ABANDONED (still OPEN after its TTL) or EXPIRED (the INCOMPLETE
-- expired), all three terminal.
CREATE TYPE "checkout_session_status" AS ENUM ('OPEN', 'AWAITING_PAYMENT', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- The kind of a vendor exception (V32-03 a): SET for every entitlement type,
-- ADD and UNLIMITED for NUMBER and NUMBER_AI_CREDIT only.
CREATE TYPE "entitlement_exception_kind" AS ENUM ('SET', 'ADD', 'UNLIMITED');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- PostgreSQL has no ALTER TYPE ... DROP VALUE. The Down refuses while a row
-- uses an added value, then rebuilds both types without them, as
-- 20261017010000 does: rename the type, create it again with its earlier
-- labels, re-type the columns, drop the old type. The CHECK constraints that
-- compare voucher_type with a literal, the column DEFAULT and the foreign key
-- that carries voucher_type are dropped first and recreated verbatim after
-- (20261016090000); entitlement_reset_anchor_required_check only tests for
-- NULL and is rebuilt by PostgreSQL itself. 20261021020000 is down already,
-- so no other object uses the new values or the two new types.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "voucher" WHERE "voucher_type"::text IN ('FLAG_GRANT', 'COMPOSITE')) THEN
    RAISE EXCEPTION 'voucher has FLAG_GRANT or COMPOSITE rows; archive and delete them before rolling back 20261021000000';
  END IF;
  IF EXISTS (SELECT 1 FROM "voucher_entitlement_grant" WHERE "voucher_type"::text IN ('FLAG_GRANT', 'COMPOSITE')) THEN
    RAISE EXCEPTION 'voucher_entitlement_grant has COMPOSITE rows; delete them before rolling back 20261021000000';
  END IF;
  IF EXISTS (SELECT 1 FROM "entitlement" WHERE "reset_anchor"::text = 'BILLING_PERIOD') THEN
    RAISE EXCEPTION 'entitlement has BILLING_PERIOD anchors; move them to another anchor before rolling back 20261021000000';
  END IF;
END $$;

DROP TYPE "entitlement_exception_kind";
DROP TYPE "checkout_session_status";

ALTER TYPE "entitlement_reset_anchor" RENAME TO "entitlement_reset_anchor_old";
CREATE TYPE "entitlement_reset_anchor" AS ENUM ('CALENDAR', 'LICENSE_START');
ALTER TABLE "entitlement"
  ALTER COLUMN "reset_anchor" TYPE "entitlement_reset_anchor" USING "reset_anchor"::text::"entitlement_reset_anchor";
DROP TYPE "entitlement_reset_anchor_old";

ALTER TABLE "voucher_entitlement_grant" DROP CONSTRAINT "voucher_entitlement_grant_voucher_id_fkey";
ALTER TABLE "voucher_entitlement_grant" DROP CONSTRAINT "voucher_entitlement_grant_voucher_type_check";
ALTER TABLE "voucher_entitlement_grant" ALTER COLUMN "voucher_type" DROP DEFAULT;
ALTER TABLE "voucher" DROP CONSTRAINT "voucher_price_fields_check";

ALTER TYPE "voucher_type" RENAME TO "voucher_type_old";
CREATE TYPE "voucher_type" AS ENUM ('PRICE', 'ENTITLEMENT_BOOST');
ALTER TABLE "voucher"
  ALTER COLUMN "voucher_type" TYPE "voucher_type" USING "voucher_type"::text::"voucher_type";
ALTER TABLE "voucher_entitlement_grant"
  ALTER COLUMN "voucher_type" TYPE "voucher_type" USING "voucher_type"::text::"voucher_type";
DROP TYPE "voucher_type_old";

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
ALTER TABLE "voucher_entitlement_grant" ALTER COLUMN "voucher_type" SET DEFAULT 'ENTITLEMENT_BOOST';
ALTER TABLE "voucher_entitlement_grant"
  ADD CONSTRAINT "voucher_entitlement_grant_voucher_type_check" CHECK ("voucher_type" = 'ENTITLEMENT_BOOST');
ALTER TABLE "voucher_entitlement_grant"
  ADD CONSTRAINT "voucher_entitlement_grant_voucher_id_fkey" FOREIGN KEY ("voucher_id", "voucher_type", "organization_id")
    REFERENCES "voucher" ("id", "voucher_type", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE;
-- +goose StatementEnd

