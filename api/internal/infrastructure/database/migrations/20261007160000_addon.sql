-- +goose Up
-- +goose StatementBegin
-- Add-ons. addon_family / addon mirror
-- license_family / license as 20260902000000 left them: a family row carrying
-- identity and the version counter, version rows with a lifecycle state (the
-- same license_lifecycle_state enum), one default per family that must be
-- PUBLISHED, and an archived version that cannot be newly attached.

CREATE TYPE "addon_override_behavior" AS ENUM ('ADD', 'OVERRIDE', 'MAX');

-- instance had no (id, organization_id) key: instance_addon, instance_voucher
-- and customer_session are the first composite references to it. (id) is the
-- primary key, so this cannot fail.
ALTER TABLE "instance"
  ADD CONSTRAINT "instance_id_organization_id_key" UNIQUE ("id", "organization_id");

CREATE TABLE "addon_family"
(
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID         NOT NULL,
  "slug"            TEXT         NOT NULL,
  "last_version"    INTEGER      NOT NULL DEFAULT 0,
  "is_public"       BOOLEAN      NOT NULL DEFAULT FALSE,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "addon_family_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "addon_family_id_organization_id_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "addon_family_organization_id_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "addon_family_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_addon_family_org_created_at"
  ON "addon_family" ("organization_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_addon_family_public"
  ON "addon_family" ("organization_id")
  WHERE "is_public";

-- An add-on version. pricing_type has no default (a new table has no N-1
-- writer; the API decides, as for license.lifecycle_state). max_quantity caps
-- instance_addon.quantity at write time (application, 422).
CREATE TABLE "addon"
(
  "id"              UUID                      NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID                      NOT NULL,
  "family_id"       UUID                      NOT NULL,
  "name"            TEXT                      NOT NULL,
  "slug"            TEXT                      NOT NULL,
  "description"     TEXT                      NOT NULL,
  "version"         INTEGER                   NOT NULL,
  "version_name"    TEXT,
  "is_default"      BOOLEAN                   NOT NULL DEFAULT FALSE,
  "lifecycle_state" "license_lifecycle_state" NOT NULL,
  "pricing_type"    "pricing_type"            NOT NULL,
  "max_quantity"    INTEGER,
  "created_at"      TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"   UUID                      NOT NULL,
  "updated_at"      TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"   UUID                      NOT NULL,

  CONSTRAINT "addon_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "addon_id_organization_id_key" UNIQUE ("id", "organization_id"),
  -- Target of instance_addon's (addon_id, addon_family_id, organization_id)
  -- key, which is what keeps instance_addon's denormalized family honest.
  CONSTRAINT "addon_id_family_id_organization_id_key" UNIQUE ("id", "family_id", "organization_id"),
  CONSTRAINT "addon_organization_id_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "addon_family_id_version_key" UNIQUE ("family_id", "version"),
  CONSTRAINT "addon_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "addon_family_id_fkey" FOREIGN KEY ("family_id", "organization_id")
    REFERENCES "addon_family" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "addon_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "addon_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "addon_default_must_be_published_check" CHECK (NOT "is_default" OR "lifecycle_state" = 'PUBLISHED'),
  CONSTRAINT "addon_max_quantity_check" CHECK ("max_quantity" IS NULL OR "max_quantity" >= 1)
);

CREATE UNIQUE INDEX "addon_family_id_is_default_key" ON "addon" ("family_id") WHERE "is_default";
CREATE INDEX "idx_addon_org_created_at"
  ON "addon" ("organization_id", "created_at" DESC, "id" DESC);

-- update_license_version(), for add-ons: the version is the family counter plus
-- one, taken by the UPDATE that advances it (which also locks the family row
-- to commit and serializes concurrent creates of one family).
CREATE FUNCTION update_addon_version()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
BEGIN
UPDATE public."addon_family"
SET "last_version" = "last_version" + 1,
    "updated_at"   = CURRENT_TIMESTAMP
WHERE "id" = NEW."family_id"
  AND "organization_id" = NEW."organization_id"
RETURNING "last_version" INTO NEW.version;
IF NOT FOUND THEN
  RAISE EXCEPTION 'addon family % does not exist in organization %', NEW."family_id", NEW."organization_id"
    USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'addon_family_id_fkey';
END IF;
NEW."version_name" := COALESCE(NEW."version_name", CONCAT('Version - ', NEW.version));
RETURN NEW;
END;
$$;

CREATE TRIGGER "update_addon_version_trigger"
  BEFORE INSERT ON "addon"
  FOR EACH ROW EXECUTE FUNCTION update_addon_version();

-- Same shape and constraints as license_price, on an add-on version. The
-- price whose billing_period equals the subscription's applies.
CREATE TABLE "addon_price"
(
  "id"                    UUID             NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"       UUID             NOT NULL,
  "addon_id"              UUID             NOT NULL,
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

  CONSTRAINT "addon_price_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "addon_price_id_organization_id_key" UNIQUE ("id", "organization_id"),
  CONSTRAINT "addon_price_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "addon_price_addon_id_fkey" FOREIGN KEY ("addon_id", "organization_id")
    REFERENCES "addon" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "addon_price_meters_entitlement_id_fkey" FOREIGN KEY ("meters_entitlement_id", "organization_id")
    REFERENCES "entitlement" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "addon_price_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "addon_price_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "addon_price_meters_entitlement_check" CHECK (
    ("billing_model" IN ('USAGE_BASED', 'OVERAGE')) = ("meters_entitlement_id" IS NOT NULL)
    ),
  CONSTRAINT "addon_price_timing_check" CHECK ("billing_model" = 'FLAT_FEE' OR "billing_timing" = 'ARREARS'),
  CONSTRAINT "addon_price_period_check" CHECK (("billing_model" = 'FLAT_FEE') = ("billing_period" IS NOT NULL)),
  CONSTRAINT "addon_price_sale_unit_factor_check" CHECK (
    ("billing_model" = 'FLAT_FEE' AND "sale_unit_factor" IS NULL)
      OR
    ("billing_model" IN ('USAGE_BASED', 'OVERAGE') AND "sale_unit_factor" IS NOT NULL AND "sale_unit_factor" > 0)
    ),
  CONSTRAINT "addon_price_unit_amount_decimal_check" CHECK ("unit_amount_decimal" >= 0),
  CONSTRAINT "addon_price_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "addon_price_display_order_check" CHECK ("display_order" >= 0),
  CONSTRAINT "addon_price_default_flat_fee_check" CHECK (
    NOT "is_default" OR ("billing_model" = 'FLAT_FEE' AND "status" = 'ACTIVE')
    ),
  CONSTRAINT "addon_price_deprecated_at_check" CHECK (("status" = 'DEPRECATED') = ("deprecated_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "addon_price_addon_id_billing_period_default_key"
  ON "addon_price" ("addon_id", "billing_period")
  WHERE "is_default";
CREATE INDEX "idx_addon_price_addon_display_order"
  ON "addon_price" ("addon_id", "display_order", "id");
CREATE INDEX "idx_addon_price_org_created_at"
  ON "addon_price" ("organization_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_addon_price_meters_entitlement"
  ON "addon_price" ("meters_entitlement_id")
  WHERE "meters_entitlement_id" IS NOT NULL;

-- license_price_single_currency(), for add-on versions.
CREATE FUNCTION addon_price_single_currency()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
DECLARE
  other_currency CHAR(3);
BEGIN
PERFORM 1
FROM public."addon" a
WHERE a."id" = NEW."addon_id"
  AND a."organization_id" = NEW."organization_id"
FOR NO KEY UPDATE;
SELECT p."currency"
INTO other_currency
FROM public."addon_price" p
WHERE p."addon_id" = NEW."addon_id"
  AND p."id" <> NEW."id"
  AND p."currency" <> NEW."currency"
LIMIT 1;
IF other_currency IS NOT NULL THEN
  RAISE EXCEPTION 'addon % already has prices in %, cannot add %', NEW."addon_id", other_currency, NEW."currency"
    USING ERRCODE = 'check_violation', CONSTRAINT = 'addon_price_single_currency';
END IF;
RETURN NEW;
END;
$$;

CREATE TRIGGER "addon_price_single_currency_trigger"
  AFTER INSERT OR UPDATE OF "currency", "addon_id" ON "addon_price"
  FOR EACH ROW EXECUTE FUNCTION addon_price_single_currency();

-- What an add-on version grants, per unit of quantity.
--
-- value: the {type, value} shape and CHECK of license_entitlement.value,
-- verbatim. override_behavior: how a NUMBER grant combines with the licence
-- (ADD sums value x quantity, OVERRIDE replaces with the latest attached, MAX
-- takes the larger); BOOLEAN grants always OR, CONFIG grants always override
-- with the latest attached, whatever this column says.
--
-- limit_cap_exceeded_overage_percent: NULL inherits the licence
-- grant's policy (0 for an entitlement granted by add-ons only); a value sets
-- the add-on's own, under the same coupling as license_entitlement (-1 exactly
-- with the unlimited value, >= 0 otherwise, NULL for non-number values).
--
-- RESTRICT towards addon and entitlement, as license_entitlement towards
-- license and entitlement: deleting a version or an entitlement that still has
-- grants is refused (409), never a silent loss of what was sold.
CREATE TABLE "addon_entitlement"
(
  "id"                                 UUID                      NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"                    UUID                      NOT NULL,
  "addon_id"                           UUID                      NOT NULL,
  "entitlement_id"                     UUID                      NOT NULL,
  "value"                              JSONB                     NOT NULL,
  "limit_cap_exceeded_overage_percent" SMALLINT,
  "override_behavior"                  "addon_override_behavior" NOT NULL DEFAULT 'MAX',
  "created_at"                         TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"                      UUID                      NOT NULL,
  "updated_at"                         TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"                      UUID                      NOT NULL,

  CONSTRAINT "addon_entitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "addon_entitlement_addon_id_entitlement_id_key" UNIQUE ("addon_id", "entitlement_id"),
  CONSTRAINT "addon_entitlement_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "addon_entitlement_addon_id_fkey" FOREIGN KEY ("addon_id", "organization_id")
    REFERENCES "addon" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "addon_entitlement_entitlement_id_fkey" FOREIGN KEY ("entitlement_id", "organization_id")
    REFERENCES "entitlement" ("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "addon_entitlement_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "addon_entitlement_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "addon_entitlement_value_check" CHECK (
    jsonb_typeof("value") = 'object'
      AND "value" ? 'type'
      AND "value" ? 'value'
      AND (
      ("value"->>'type' = 'number' AND jsonb_typeof("value"->'value') = 'number')
        OR
      ("value"->>'type' = 'boolean' AND jsonb_typeof("value"->'value') = 'boolean')
        OR
      ("value"->>'type' = 'object' AND jsonb_typeof("value"->'value') = 'object')
      )
    ),
  CONSTRAINT "addon_entitlement_overage_percent_number_only_check" CHECK (
    "limit_cap_exceeded_overage_percent" IS NULL OR "value"->>'type' = 'number'
    ),
  -- Same coupling as license_entitlement_overage_percent_unlimited_check; the
  -- type test comes first so a non-number value is never cast to numeric
  -- (addon_entitlement_overage_percent_number_only_check reports that case).
  CONSTRAINT "addon_entitlement_overage_percent_unlimited_check" CHECK (
    "limit_cap_exceeded_overage_percent" IS NULL
      OR "value"->>'type' <> 'number'
      OR
    (("value"->>'value')::numeric = -1 AND "limit_cap_exceeded_overage_percent" = -1)
      OR
    (("value"->>'value')::numeric <> -1 AND "limit_cap_exceeded_overage_percent" >= 0)
    )
);

CREATE INDEX "idx_addon_entitlement_entitlement"
  ON "addon_entitlement" ("entitlement_id");

-- Compatibility is declared per add-on VERSION against a licence FAMILY: the
-- attach check resolves the instance's pinned licence version to its family,
-- so publishing a new licence version never orphans compatibility. No row for
-- an add-on version = compatible with no licence (application rule: an add-on
-- must declare at least one family to be attachable).
CREATE TABLE "addon_compatible_license"
(
  "addon_id"          UUID         NOT NULL,
  "license_family_id" UUID         NOT NULL,
  "organization_id"   UUID         NOT NULL,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "addon_compatible_license_pkey" PRIMARY KEY ("addon_id", "license_family_id"),
  CONSTRAINT "addon_compatible_license_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "addon_compatible_license_addon_id_fkey" FOREIGN KEY ("addon_id", "organization_id")
    REFERENCES "addon" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "addon_compatible_license_license_family_id_fkey" FOREIGN KEY ("license_family_id", "organization_id")
    REFERENCES "license_family" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_addon_compatible_license_family"
  ON "addon_compatible_license" ("license_family_id");

-- Which add-on versions an instance holds, and how many. The entitlement
-- effect is immediate (instance_effective_entitlement reads the active rows);
-- billing reads the quantity in force at each boundary. Removal is soft
-- (removed_at), so the history a composition or a dispute needs stays.
--
-- addon_family_id is denormalized from addon.family_id so that "one active
-- attachment per add-on FAMILY per instance" can be a partial unique index --
-- moving to a new version of the same add-on is remove + attach. The
-- (addon_id, addon_family_id, organization_id) foreign key makes the copy
-- impossible to get wrong and keeps the tenant invariant.
--
-- CASCADE from instance: attachments are entitlement state; what was billed is
-- snapshotted on invoice lines. RESTRICT towards addon: an attached
-- version, even one removed since, is history and cannot be deleted.
CREATE TABLE "instance_addon"
(
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID         NOT NULL,
  "instance_id"     UUID         NOT NULL,
  "addon_id"        UUID         NOT NULL,
  "addon_family_id" UUID         NOT NULL,
  "quantity"        INTEGER      NOT NULL DEFAULT 1,
  "removed_at"      TIMESTAMP(3),
  "removed_by_id"   UUID,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"   UUID         NOT NULL,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"   UUID         NOT NULL,

  CONSTRAINT "instance_addon_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instance_addon_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_addon_instance_id_fkey" FOREIGN KEY ("instance_id", "organization_id")
    REFERENCES "instance" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_addon_addon_id_fkey" FOREIGN KEY ("addon_id", "addon_family_id", "organization_id")
    REFERENCES "addon" ("id", "family_id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_addon_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "instance_addon_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_addon_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_addon_quantity_check" CHECK ("quantity" >= 1),
  CONSTRAINT "instance_addon_removed_check" CHECK ("removed_by_id" IS NULL OR "removed_at" IS NOT NULL)
);

-- One active attachment per add-on family per instance; also the access path
-- of the effective view (instance_id leading, active rows only).
CREATE UNIQUE INDEX "instance_addon_instance_id_addon_family_id_active_key"
  ON "instance_addon" ("instance_id", "addon_family_id")
  WHERE "removed_at" IS NULL;
-- RESTRICT check on addon delete, the grant freeze for add-on
-- versions, and "who holds this version".
CREATE INDEX "idx_instance_addon_addon"
  ON "instance_addon" ("addon_id");
CREATE INDEX "idx_instance_addon_instance_created_at"
  ON "instance_addon" ("instance_id", "created_at" DESC, "id" DESC);

-- instance_license_not_archived(), for add-ons: an ARCHIVED add-on version is
-- withdrawn from sale -- attachments already holding it keep it, a new
-- attachment (or a move onto it) is refused. DRAFT is allowed, so a vendor can
-- test a version on an instance before publishing. The add-on row is locked
-- FOR SHARE so an archive and an attach of the same version serialize.
CREATE FUNCTION instance_addon_not_archived()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
DECLARE
  attached_state license_lifecycle_state;
BEGIN
IF TG_OP = 'UPDATE' AND NEW."addon_id" IS NOT DISTINCT FROM OLD."addon_id" THEN
  RETURN NEW;
END IF;
SELECT a."lifecycle_state"
INTO attached_state
FROM public."addon" a
WHERE a."id" = NEW."addon_id"
  AND a."organization_id" = NEW."organization_id"
FOR SHARE;
IF attached_state = 'ARCHIVED' THEN
  RAISE EXCEPTION 'addon % is archived and cannot be attached to an instance', NEW."addon_id"
    USING ERRCODE = 'check_violation', CONSTRAINT = 'instance_addon_not_archived';
END IF;
RETURN NEW;
END;
$$;

CREATE TRIGGER "instance_addon_not_archived_insert_trigger"
  BEFORE INSERT ON "instance_addon"
  FOR EACH ROW EXECUTE FUNCTION instance_addon_not_archived();

CREATE TRIGGER "instance_addon_not_archived_update_trigger"
  AFTER UPDATE OF "addon_id" ON "instance_addon"
  FOR EACH ROW EXECUTE FUNCTION instance_addon_not_archived();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "instance_addon";
DROP FUNCTION IF EXISTS instance_addon_not_archived();
DROP TABLE IF EXISTS "addon_compatible_license";
DROP TABLE IF EXISTS "addon_entitlement";
DROP TABLE IF EXISTS "addon_price";
DROP FUNCTION IF EXISTS addon_price_single_currency();
DROP TABLE IF EXISTS "addon";
DROP FUNCTION IF EXISTS update_addon_version();
DROP TABLE IF EXISTS "addon_family";
ALTER TABLE "instance" DROP CONSTRAINT IF EXISTS "instance_id_organization_id_key";
DROP TYPE IF EXISTS "addon_override_behavior";
-- +goose StatementEnd

