-- +goose Up
-- +goose StatementBegin
-- The self-serve rules of v3.1 (V31-63 ... V31-67, V31-69, V31-70): what a
-- checkout bought before it is paid, one trial per customer and licence
-- family, the trial end without a payment method, the fallback licence
-- family, deferred public add-on decreases, the trial-end notice and the
-- ADVANCE add-on true-up. Every new column is nullable or has a DEFAULT, and
-- nothing is seeded: customer_trial is backfilled from existing rows only.

CREATE TYPE "trial_end_without_payment_method" AS ENUM ('CANCEL', 'CONVERT');
CREATE TYPE "addon_increase_billing" AS ENUM ('TRUE_UP', 'NEXT_BOUNDARY');

-- Licence family settings, both set with PATCH /license-families.
--
-- fallback_license_family_id: the family an instance moves to when a
-- subscription of this family becomes CANCELED (V31-66). It must be another
-- family of the same organization (composite key, CHECK) and a FREE one, which
-- the application checks when it is set, when a version of the target is
-- created or changes pricing type, and again at the move. RESTRICT: a family
-- that is another family's fallback cannot be deleted.
--
-- trial_end_without_payment_method: what the close does at trial_ends_at when
-- collection is CHARGE_AUTOMATICALLY, the ACTIVATION would total more than 0
-- and the customer has no ACTIVE payment method (V31-65). CANCEL by default,
-- for every existing family and every insert that does not name it.
ALTER TABLE "license_family"
  ADD COLUMN "fallback_license_family_id" UUID,
  ADD COLUMN "trial_end_without_payment_method" "trial_end_without_payment_method" NOT NULL DEFAULT 'CANCEL';
ALTER TABLE "license_family"
  ADD CONSTRAINT "license_family_fallback_license_family_id_fkey" FOREIGN KEY ("fallback_license_family_id", "organization_id")
    REFERENCES "license_family" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "license_family_fallback_check" CHECK ("fallback_license_family_id" <> "id");
CREATE INDEX "idx_license_family_fallback"
  ON "license_family" ("fallback_license_family_id")
  WHERE "fallback_license_family_id" IS NOT NULL;

-- How a mid-period increase or attachment of an ADVANCE add-on of the family
-- is billed (V31-70): TRUE_UP adds a true-up line at the next RENEWAL or
-- FINAL for the highest quantity held in the elapsed period; NEXT_BOUNDARY
-- bills it from the next boundary only. Read at each composition.
ALTER TABLE "addon_family"
  ADD COLUMN "increase_billing" "addon_increase_billing" NOT NULL DEFAULT 'TRUE_UP';

-- pending_quantity: a decrease made through the public surface, applied by
-- the close of the next boundary (V31-67). NULL = nothing scheduled, 0 = a
-- removal, n >= 1 = the quantity from the boundary on. Until then quantity
-- keeps its entitlement effect and its billing.
--
-- period_max_quantity: the highest quantity held since the last composed
-- boundary, which the ADVANCE true-up reads (V31-70). Every increase raises
-- it in the same UPDATE (the CHECK refuses a quantity above it), a decrease
-- leaves it, and the transaction that composes a boundary resets it to the
-- quantity in force there. The DEFAULT only serves the ADD COLUMN: the backfill
-- sets every existing row to its quantity, and the application always writes
-- it.
ALTER TABLE "instance_addon"
  ADD COLUMN "pending_quantity" INTEGER,
  ADD COLUMN "period_max_quantity" INTEGER NOT NULL DEFAULT 1;
UPDATE "instance_addon" SET "period_max_quantity" = "quantity" WHERE "period_max_quantity" <> "quantity";
ALTER TABLE "instance_addon"
  ADD CONSTRAINT "instance_addon_pending_quantity_check" CHECK (
    "pending_quantity" IS NULL
      OR ("pending_quantity" >= 0 AND "pending_quantity" < "quantity" AND "removed_at" IS NULL)
    ),
  ADD CONSTRAINT "instance_addon_period_max_quantity_check" CHECK ("period_max_quantity" >= "quantity");

-- What an INCOMPLETE checkout bought (V31-63, INV-33): the licence version the
-- instance switches to when the ACTIVATION invoice is PAID, the add-ons and
-- voucher the payment attaches and redeems (camelCase JSON,
-- {addOns: [{addonId, quantity, instanceAddonId}], voucher: {voucherId, code,
-- instanceVoucherId} | null}), and the instant the unpaid checkout expires
-- (anchor_at + 23 h). All three are set exactly while the row is INCOMPLETE.
-- RESTRICT: a version a checkout waits on cannot be deleted.
--
-- trial_will_end_notified_at: the once-only marker of the trial_will_end
-- event (V31-69), set by billing-lifecycle in the transaction that emits it,
-- cleared by a resubscribe.
ALTER TABLE "instance_billing"
  ADD COLUMN "pending_license_id" UUID,
  ADD COLUMN "pending_selection" JSONB,
  ADD COLUMN "incomplete_expires_at" TIMESTAMP(3),
  ADD COLUMN "trial_will_end_notified_at" TIMESTAMP(3);
ALTER TABLE "instance_billing"
  ADD CONSTRAINT "instance_billing_pending_license_id_fkey" FOREIGN KEY ("pending_license_id", "organization_id")
    REFERENCES "license" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "instance_billing_incomplete_check" CHECK (
    ("status" = 'INCOMPLETE') = ("pending_license_id" IS NOT NULL)
      AND ("status" = 'INCOMPLETE') = ("pending_selection" IS NOT NULL)
      AND ("status" = 'INCOMPLETE') = ("incomplete_expires_at" IS NOT NULL)
      AND ("pending_selection" IS NULL OR jsonb_typeof("pending_selection") = 'object')
    );
-- billing-lifecycle step (d): the INCOMPLETE rows whose checkout expired.
CREATE INDEX "idx_instance_billing_incomplete_expires_at"
  ON "instance_billing" ("incomplete_expires_at")
  WHERE "status" = 'INCOMPLETE';
-- RESTRICT check on licence delete.
CREATE INDEX "idx_instance_billing_pending_license"
  ON "instance_billing" ("pending_license_id")
  WHERE "pending_license_id" IS NOT NULL;
-- billing-lifecycle step (e): the trials not notified yet.
CREATE INDEX "idx_instance_billing_trial_ends_at"
  ON "instance_billing" ("trial_ends_at")
  WHERE "status" = 'TRIAL' AND "trial_will_end_notified_at" IS NULL;

-- The freeze of 20261007140000, extended to INCOMPLETE: a checkout waiting for
-- its payment holds the instance's customer and licence like any live
-- subscription. The escape is unchanged and is set only by the three billing
-- transactions that move a licence: the close applying a scheduled plan
-- change, the transaction recording the ACTIVATION payment of an INCOMPLETE
-- subscription (license_id := pending_license_id), and the cancellation that
-- applies a fallback move.
CREATE OR REPLACE FUNCTION instance_billing_freeze()
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
IF billing_status IN ('INCOMPLETE', 'TRIAL', 'ACTIVE', 'PAST_DUE')
   AND current_setting('kaiten.billing_apply_plan_change', true) IS DISTINCT FROM 'on' THEN
  RAISE EXCEPTION 'instance % has a % subscription: its customer and license are frozen', NEW."id", billing_status
    USING ERRCODE = 'restrict_violation', CONSTRAINT = 'instance_billing_freeze';
END IF;
RETURN NEW;
END;
$$;

-- One trial per customer and licence family (V31-64, INV-32). Every subscribe
-- that creates or reactivates a row in TRIAL inserts the record in its own
-- transaction, ON CONFLICT DO NOTHING; every subscribe reads it for the family
-- of its base price's version. Nothing updates or deletes a record: it goes
-- with its customer, its family or its organization. instance_id names the
-- instance whose subscription started the trial and survives that instance's
-- deletion (single-column SET NULL + tenant guard, like
-- instance_billing_instance_id_fkey). No audit columns: the
-- instance.billing.started event that accompanies the write carries the actor.
CREATE TABLE "customer_trial"
(
  "customer_id"       UUID         NOT NULL,
  "license_family_id" UUID         NOT NULL,
  "organization_id"   UUID         NOT NULL,
  "instance_id"       UUID,
  "consumed_at"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_trial_pkey" PRIMARY KEY ("customer_id", "license_family_id"),
  CONSTRAINT "customer_trial_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_trial_customer_id_fkey" FOREIGN KEY ("customer_id", "organization_id")
    REFERENCES "customer" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_trial_license_family_id_fkey" FOREIGN KEY ("license_family_id", "organization_id")
    REFERENCES "license_family" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_trial_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instance" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TRIGGER "customer_trial_instance_same_tenant_trigger"
  AFTER INSERT OR UPDATE OF "instance_id" ON "customer_trial"
  FOR EACH ROW EXECUTE FUNCTION billing_reference_same_tenant('instance_id', 'instance', 'customer_trial_instance_id_fkey');

-- SET NULL on instance delete.
CREATE INDEX "idx_customer_trial_instance"
  ON "customer_trial" ("instance_id")
  WHERE "instance_id" IS NOT NULL;

-- Backfill: one record per (customer, family) from the subscriptions that had
-- a trial, the family being that of the subscription's base price; the
-- earliest start wins.
INSERT INTO "customer_trial" ("customer_id", "license_family_id", "organization_id", "instance_id", "consumed_at")
SELECT DISTINCT ON (ib."customer_id", l."family_id")
       ib."customer_id", l."family_id", ib."organization_id", ib."instance_id", ib."started_at"
FROM "instance_billing" ib
JOIN "license_price" lp
  ON lp."id" = ib."base_license_price_id"
 AND lp."organization_id" = ib."organization_id"
JOIN "license" l
  ON l."id" = lp."license_id"
 AND l."organization_id" = lp."organization_id"
WHERE ib."trial_ends_at" IS NOT NULL
  AND ib."customer_id" IS NOT NULL
ORDER BY ib."customer_id", l."family_id", ib."started_at", ib."id";
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- An INCOMPLETE row cannot be represented without its pending columns, and a
-- scheduled decrease would be lost silently: the Down refuses both.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "instance_billing" WHERE "status" = 'INCOMPLETE') THEN
    RAISE EXCEPTION 'instance_billing has INCOMPLETE rows; let them expire or cancel them before rolling back 20261017020000';
  END IF;
  IF EXISTS (SELECT 1 FROM "instance_addon" WHERE "pending_quantity" IS NOT NULL) THEN
    RAISE EXCEPTION 'instance_addon has scheduled decreases; apply or clear them before rolling back 20261017020000';
  END IF;
END $$;

DROP TABLE IF EXISTS "customer_trial";

-- Back to the freeze of 20261007140000, verbatim.
CREATE OR REPLACE FUNCTION instance_billing_freeze()
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

DROP INDEX IF EXISTS "idx_instance_billing_trial_ends_at";
DROP INDEX IF EXISTS "idx_instance_billing_pending_license";
DROP INDEX IF EXISTS "idx_instance_billing_incomplete_expires_at";
ALTER TABLE "instance_billing" DROP CONSTRAINT IF EXISTS "instance_billing_incomplete_check";
ALTER TABLE "instance_billing" DROP CONSTRAINT IF EXISTS "instance_billing_pending_license_id_fkey";
ALTER TABLE "instance_billing"
  DROP COLUMN IF EXISTS "trial_will_end_notified_at",
  DROP COLUMN IF EXISTS "incomplete_expires_at",
  DROP COLUMN IF EXISTS "pending_selection",
  DROP COLUMN IF EXISTS "pending_license_id";

ALTER TABLE "instance_addon" DROP CONSTRAINT IF EXISTS "instance_addon_period_max_quantity_check";
ALTER TABLE "instance_addon" DROP CONSTRAINT IF EXISTS "instance_addon_pending_quantity_check";
ALTER TABLE "instance_addon"
  DROP COLUMN IF EXISTS "period_max_quantity",
  DROP COLUMN IF EXISTS "pending_quantity";

ALTER TABLE "addon_family" DROP COLUMN IF EXISTS "increase_billing";

DROP INDEX IF EXISTS "idx_license_family_fallback";
ALTER TABLE "license_family" DROP CONSTRAINT IF EXISTS "license_family_fallback_check";
ALTER TABLE "license_family" DROP CONSTRAINT IF EXISTS "license_family_fallback_license_family_id_fkey";
ALTER TABLE "license_family"
  DROP COLUMN IF EXISTS "trial_end_without_payment_method",
  DROP COLUMN IF EXISTS "fallback_license_family_id";

DROP TYPE IF EXISTS "addon_increase_billing";
DROP TYPE IF EXISTS "trial_end_without_payment_method";
-- +goose StatementEnd
