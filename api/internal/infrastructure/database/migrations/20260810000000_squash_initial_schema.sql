-- +goose Up
-- +goose StatementBegin
-- This migration replaces the 20 migrations that previously made up the
-- schema history (20250322124519_initial.sql through
-- 20260804000000_drop_demo_seed_run.sql). It was squashed because
-- the product has not been deployed to production yet, so there is
-- no live schema history to preserve and no external consumer of specific
-- migration versions. It reproduces the exact end-state schema those 20
-- migrations left behind (verified by diffing a pg_dump of a database
-- migrated through all 20 originals against a pg_dump of a database
-- migrated through this file alone) - nothing was added, removed, or
-- reshaped beyond what squashing intrinsically does (collapsing
-- create-then-drop objects like demo_seed_run and feature_audit_trail's
-- superseded status column, and folding later ALTER TABLE ... ADD/DROP
-- COLUMN and ADD/DROP CONSTRAINT statements into the CREATE TABLE they
-- amend). Table/column/constraint/index names are preserved from the
-- originals throughout.
--
-- Any pre-existing local/dev/CI database that already applied the old
-- migration history should be reset (drop + recreate, e.g. `docker compose
-- down -v`) rather than migrated onto this squash.

-- CreateEnum
CREATE TYPE "license_type" AS ENUM ('DEVELOPMENT', 'TRIAL', 'PAID', 'COMMUNITY');
CREATE TYPE "entitlement_type" AS ENUM ('BOOLEAN', 'NUMBER', 'CONFIG', 'NUMBER_AI_CREDIT');
CREATE TYPE "entitlement_enforcement_mode" AS ENUM ('HARD', 'SOFT');
CREATE TYPE "meter_type" AS ENUM ('CALCULATED_USAGE', 'RAW_EVENT');
CREATE TYPE "aggregation_method" AS ENUM ('SUM', 'COUNT', 'AVERAGE', 'MAX', 'MIN', 'LATEST');
CREATE TYPE "user_type" AS ENUM ('human', 'machine');
CREATE TYPE "metadata_field_resource_type" AS ENUM ('DEPLOYMENT_ZONE', 'INSTANCE');
CREATE TYPE "instance_status" AS ENUM ('HEALTHY', 'DEGRADED', 'INCIDENT', 'MAINTENANCE');
-- +goose StatementEnd

-- CreateTable organization (no dependencies)
CREATE TABLE "organization"
(
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "external_id" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "deleted_at"  TIMESTAMP(3),

  CONSTRAINT "organization_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_external_id_key" UNIQUE ("external_id")
);

-- CreateTable user (depends on: organization)
CREATE TABLE "user"
(
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "external_id"     TEXT         NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"   UUID,
  "deleted_at"      TIMESTAMP(3),
  "email"           TEXT,
  "name"            TEXT         NOT NULL,
  "slug"            TEXT,
  "type"            "user_type"  NOT NULL DEFAULT 'human',
  "organization_id" UUID,

  CONSTRAINT "user_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_external_id_key" UNIQUE ("external_id"),
  CONSTRAINT "user_email_key" UNIQUE ("email"),
  CONSTRAINT "user_slug_machine_check" CHECK ("type" != 'machine' OR "slug" IS NOT NULL),
  CONSTRAINT "user_email_machine_check" CHECK ("type" != 'machine' OR "email" IS NULL),
  CONSTRAINT "user_organization_id_machine_check" CHECK ("type" != 'machine' OR "organization_id" IS NOT NULL),
  CONSTRAINT "user_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "idx_unique_machine_slug_per_org"
    ON "user" (slug, organization_id)
    WHERE type = 'machine';

-- CreateTable user_on_organization (depends on: organization, user)
CREATE TABLE "user_on_organization"
(
  "deleted_at" TIMESTAMP(3),
  "organization_id" UUID NOT NULL,
  "user_id"    UUID NOT NULL,

  CONSTRAINT "user_on_organization_pkey" PRIMARY KEY ("organization_id", "user_id"),
  CONSTRAINT "user_on_organization_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_on_organization_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION ensure_kaiten_system_user_membership_for_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" <> '00000000-0000-0000-0000-000000000001'::uuid
     AND EXISTS (
    SELECT 1
    FROM "user"
    WHERE "id" = '00000000-0000-0000-0000-000000000001'::uuid
      AND "external_id" = 'system:kaiten'
  ) THEN
    INSERT INTO "user_on_organization" ("organization_id", "user_id", "deleted_at")
    VALUES (NEW."id", '00000000-0000-0000-0000-000000000001'::uuid, NULL)
    ON CONFLICT ("organization_id", "user_id") DO UPDATE
    SET "deleted_at" = NULL;
  END IF;

  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_ensure_kaiten_system_user_membership_on_org ON "organization";
CREATE TRIGGER trg_ensure_kaiten_system_user_membership_on_org
AFTER INSERT ON "organization"
FOR EACH ROW
EXECUTE FUNCTION ensure_kaiten_system_user_membership_for_org();

-- CreateTable customer (depends on: user, organization)
CREATE TABLE "customer"
(
  "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
  "name"                 TEXT         NOT NULL,
  "slug"                 TEXT         NOT NULL,
  "external_customer_id" TEXT,
  "created_by_id"        UUID         NOT NULL,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"        UUID         NOT NULL,
  "updated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organization_id"      UUID         NOT NULL,
  "domain"               TEXT,

  CONSTRAINT "customer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_organization_id_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "customer_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Partial index for embedded-client lookups by their own tenant id (see
-- 20260803000000_add_customer_external_id_index.sql in the pre-squash
-- history for the full rationale: not unique, partial since the column is
-- only populated for integration-originated customers).
CREATE INDEX IF NOT EXISTS "customer_org_external_id_idx"
  ON "customer" ("organization_id", "external_customer_id")
  WHERE "external_customer_id" IS NOT NULL;

-- CreateTable license (depends on: organization)
CREATE TABLE "license"
(
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "name"         TEXT           NOT NULL,
  "slug"         TEXT           NOT NULL,
  "description"  TEXT           NOT NULL,
  "type"         "license_type" NOT NULL,
  "version"      SERIAL         NOT NULL,
  "version_name" TEXT,
  "is_active"    BOOLEAN        NOT NULL,
  "is_default"   BOOLEAN        NOT NULL DEFAULT FALSE,
  "features"     JSONB,
  "organization_id" UUID NOT NULL,

  CONSTRAINT "license_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "license_name_version_organization_id_key" UNIQUE ("name", "version", "organization_id"),
  CONSTRAINT "license_organization_id_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "license_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable entitlement (depends on: organization)
CREATE TABLE "entitlement"
(
  "id"                 UUID               NOT NULL DEFAULT gen_random_uuid(),
  "name"               TEXT               NOT NULL,
  "slug"               TEXT               NOT NULL,
  "description"        TEXT,
  "type"               "entitlement_type" NOT NULL,
  "event_name"         TEXT               NOT NULL,
  "meter_type"         "meter_type",
  "aggregation_method" "aggregation_method",
  "organization_id"    UUID               NOT NULL,
  "icon"               VARCHAR,
  "unit_singular"      TEXT,
  "unit_plural"        TEXT,
  "sale_unit_singular" TEXT,
  "sale_unit_plural"   TEXT,
  "sale_unit_factor"   DOUBLE PRECISION,
  "user_facing"        BOOLEAN            NOT NULL DEFAULT false,
  "display_order"      INTEGER            NOT NULL DEFAULT 0,
  "enforcement_mode"   "entitlement_enforcement_mode" NOT NULL DEFAULT 'HARD',
  "warning_threshold_percent" SMALLINT    NOT NULL DEFAULT 0,

  CONSTRAINT "entitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entitlement_organization_id_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "entitlement_number_meter_check" CHECK (
    ("type" IN ('NUMBER', 'NUMBER_AI_CREDIT') AND "meter_type" IN ('CALCULATED_USAGE', 'RAW_EVENT'))
      OR
    ("type" IN ('BOOLEAN', 'CONFIG') AND "meter_type" IS NULL)
    ),
  CONSTRAINT "entitlement_aggregation_method_check" CHECK (
    ("type" IN ('NUMBER', 'NUMBER_AI_CREDIT') AND "meter_type" = 'RAW_EVENT' AND "aggregation_method" IN ('COUNT', 'SUM', 'AVERAGE', 'MAX', 'MIN', 'LATEST'))
      OR
    ("type" IN ('NUMBER', 'NUMBER_AI_CREDIT') AND "meter_type" = 'CALCULATED_USAGE')
      OR
    ("type" IN ('BOOLEAN', 'CONFIG') AND "aggregation_method" IS NULL)
    ),
  CONSTRAINT "entitlement_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entitlement_units_number_type_check" CHECK (
    "type" IN ('NUMBER', 'NUMBER_AI_CREDIT')
      OR
    (
      "unit_singular" IS NULL
        AND "unit_plural" IS NULL
        AND "sale_unit_singular" IS NULL
        AND "sale_unit_plural" IS NULL
        AND "sale_unit_factor" IS NULL
      )
    ),
  CONSTRAINT "entitlement_warning_threshold_percent_check" CHECK (
    "warning_threshold_percent" BETWEEN 0 AND 100
    ),
  CONSTRAINT "entitlement_ai_credit_enforcement_check" CHECK (
    "type" <> 'NUMBER_AI_CREDIT' OR "enforcement_mode" = 'SOFT'
    ),
  CONSTRAINT "entitlement_unit_pair_check" CHECK (
    ("unit_singular" IS NULL) = ("unit_plural" IS NULL)
    ),
  CONSTRAINT "entitlement_sale_unit_trio_check" CHECK (
    (
      "sale_unit_singular" IS NULL
        AND "sale_unit_plural" IS NULL
        AND "sale_unit_factor" IS NULL
      )
      OR
    (
      "sale_unit_singular" IS NOT NULL
        AND "sale_unit_plural" IS NOT NULL
        AND "sale_unit_factor" IS NOT NULL
        AND "unit_singular" IS NOT NULL
        AND "unit_plural" IS NOT NULL
      )
    ),
  CONSTRAINT "entitlement_sale_unit_factor_check" CHECK (
    "sale_unit_factor" IS NULL OR "sale_unit_factor" > 0
    ),
  CONSTRAINT "entitlement_display_order_check" CHECK ("display_order" >= 0)
);

-- CreateTable license_entitlement (depends on: organization, entitlement, license)
CREATE TABLE "license_entitlement"
(
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "entitlement_id" UUID         NOT NULL,
  "license_id"     UUID         NOT NULL,
  "created_by_id"  UUID         NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"  UUID         NOT NULL,
  "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "value"          JSONB        NOT NULL,
  "organization_id" UUID NOT NULL,

  CONSTRAINT "license_entitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "license_entitlement_value_check" CHECK (
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
  CONSTRAINT "license_entitlement_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "license_entitlement_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "license_entitlement_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "license" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable deployment_zone (depends on: organization, user)
CREATE TABLE "deployment_zone"
(
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "name"          VARCHAR      NOT NULL,
  "slug"          TEXT         NOT NULL,
  "type"          VARCHAR      NOT NULL,
  "metadata"      JSONB,
  "description"   TEXT         NOT NULL,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" UUID         NOT NULL,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id" UUID         NOT NULL,
  "organization_id" UUID NOT NULL,

  CONSTRAINT "deployment_zone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deployment_zone_organization_id_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "deployment_zone_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable instance (depends on: user, customer, license, organization, deployment_zone)
CREATE TABLE "instance"
(
  "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
  "created_by_id"      UUID         NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"      UUID         NOT NULL,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"         TIMESTAMP(3),
  "name"               TEXT         NOT NULL,
  "slug"               TEXT         NOT NULL,
  "description"        TEXT         NOT NULL,
  "customer_id"        UUID         NOT NULL,
  "license_id"         UUID         NOT NULL,
  "deployment_zone_id" UUID                  DEFAULT NULL,
  "start_license_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "end_license_date"   TIMESTAMP(3) NOT NULL DEFAULT (NOW() + '1 year'::interval),
  "platform"           JSONB,
  "metadata"           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "organization_id"    UUID         NOT NULL,
  "status"             "instance_status" NOT NULL DEFAULT 'HEALTHY',
  "lifecycle_stage"    VARCHAR,

  CONSTRAINT "instance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instance_organization_id_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "instance_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_license_id_fkey" FOREIGN KEY ("license_id") REFERENCES "license" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "instance_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_deployment_zone_id_fkey" FOREIGN KEY ("deployment_zone_id") REFERENCES "deployment_zone" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable entitlement_usage (depends on: organization, entitlement, instance)
CREATE TABLE "entitlement_usage"
(
  "entitlement_id" UUID    NOT NULL,
  "instance_id"    UUID    NOT NULL,
  "value"          JSONB   NOT NULL,
  "organization_id" UUID NOT NULL,

  CONSTRAINT "entitlement_usage_pkey" PRIMARY KEY ("entitlement_id", "instance_id"),
  CONSTRAINT "entitlement_usage_value_check" CHECK (
    jsonb_typeof("value") = 'object'
      AND "value" ? 'type'
      AND "value" ? 'value'
      AND "value" ? 'event_count'
      AND "value"->>'type' = 'number'
      AND jsonb_typeof("value"->'value') = 'number'
      AND jsonb_typeof("value"->'event_count') = 'number'
      AND (("value"->>'event_count')::numeric >= 0)
      AND floor(("value"->>'event_count')::numeric) = ("value"->>'event_count')::numeric
    ),
  CONSTRAINT "entitlement_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entitlement_usage_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "entitlement_usage_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable audit_trail (depends on: organization, instance)
-- Generic audit log populated by the audit-trail subscriber via outbox CDC.
-- All domain events written to outbox_events are forwarded here.
-- Supersedes the original feature_audit_trail table (entitlement-specific,
-- dropped in the pre-squash history's 20260515000000_audit_trail.sql), and
-- its "status" column already came and went in that same pre-squash history
-- (20260516000000_drop_audit_trail_status.sql), so neither ever makes it
-- into this squashed schema.
CREATE TABLE "audit_trail"
(
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID        NOT NULL,
  "instance_id"     UUID,
  "event_name"      TEXT        NOT NULL,
  "event_type"      TEXT        NOT NULL,
  "occurred_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "payload"         JSONB,

  CONSTRAINT "audit_trail_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_trail_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "audit_trail_instance_id_fkey"     FOREIGN KEY ("instance_id")     REFERENCES "instance" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_audit_trail_org_instance" ON "audit_trail" ("organization_id", "instance_id");
CREATE INDEX "idx_audit_trail_occurred_at"  ON "audit_trail" ("occurred_at" DESC);

-- CreateTable feature_flags (depends on: organization)
CREATE TABLE "feature_flags"
(
  "id"              UUID    NOT NULL DEFAULT gen_random_uuid(),
  "type"            VARCHAR NOT NULL,
  "variants"        JSONB   NOT NULL,
  "targeting_rules" JSONB,
  "name"            VARCHAR NOT NULL,
  "description"     TEXT,
  "slug"            VARCHAR NOT NULL,
  "metadata"        JSONB,
  "enabled"         BOOLEAN NOT NULL,
  "event_name"      VARCHAR NOT NULL,
  "organization_id" UUID NOT NULL,
  "default_variant" JSONB   NOT NULL,

  CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "uq_feature_flags_slug" UNIQUE ("slug", "organization_id"),
  CONSTRAINT "feature_flags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable token (depends on: user, organization)
CREATE TABLE "token"
(
  "id"                          UUID          NOT NULL DEFAULT gen_random_uuid(),
  "name"                        TEXT          NOT NULL,
  "slug"                        TEXT          NOT NULL,
  "hash"                        TEXT          NOT NULL,
  "lookup_hash"                 TEXT          NOT NULL,
  "created_by"                  UUID          NOT NULL,
  "created_at"                  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"                  TIMESTAMP(3),
  "service_account_id"          UUID          NOT NULL,
  "revoked_by"                  UUID,
  "revoked_date"                TIMESTAMP(3),
  "organization_id" UUID NOT NULL,
  "scopes"                      TEXT[] NOT NULL DEFAULT '{}',

  CONSTRAINT "token_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "token_hash_key" UNIQUE ("hash"),
  CONSTRAINT "token_slug" UNIQUE ("slug", "organization_id"),
  CONSTRAINT "token_name" UNIQUE ("service_account_id", "name", "organization_id"),
  CONSTRAINT "token_service_account_id_fkey" FOREIGN KEY ("service_account_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "token_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "token_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "token_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE

);

CREATE INDEX "idx_token_lookup_hash_active"
  ON "token" ("lookup_hash")
  INCLUDE ("hash", "service_account_id", "organization_id", "scopes", "expires_at")
  WHERE "revoked_date" IS NULL;

-- CreateTable outbox_events (depends on: organization)
CREATE TABLE "outbox_events"
(
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "event_name"  TEXT        NOT NULL,
  "event_type"  TEXT        NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "data"        JSONB       NOT NULL,
  "headers"     JSONB,

  CONSTRAINT "outbox_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- +goose StatementBegin
-- Debezium's PostgreSQL connector requires the replicating role to own any
-- table it adds to a CREATE PUBLICATION ... FOR TABLE statement - SELECT
-- and REPLICATION alone aren't enough, even with USAGE on the schema.
-- debezium_repl itself is intentionally NOT created here: it needs a
-- REPLICATION attribute and a password, both bootstrap/secret concerns
-- that don't belong in a checked-in migration. This only grants/transfers
-- what's needed once that role already exists - a no-op (skipped via the
-- IF EXISTS guard) on any environment that hasn't bootstrapped it yet, and
-- safely idempotent (GRANT/ALTER OWNER have no effect if already applied)
-- on every later migration run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'debezium_repl') THEN
    GRANT CREATE ON SCHEMA public TO debezium_repl;
    GRANT debezium_repl TO CURRENT_USER;
    GRANT ALL ON public.outbox_events TO CURRENT_USER;
    ALTER TABLE public.outbox_events OWNER TO debezium_repl;
  END IF;
END $$;
-- +goose StatementEnd

-- CreateTable release (depends on: organization, user)
CREATE TABLE "release"
(
  "id"                  UUID         NOT NULL DEFAULT gen_random_uuid(),
  "previous_release_id" UUID                  DEFAULT NULL,
  "version"             VARCHAR      NOT NULL,
  "slug"                TEXT         NOT NULL,
  "description"         TEXT,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"       UUID         NOT NULL,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"       UUID         NOT NULL,
  "organization_id" UUID NOT NULL,

  CONSTRAINT "release_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "previous_release_fkey" FOREIGN KEY ("previous_release_id") REFERENCES "release" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "release_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "release_created_by_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "component_version_unique" UNIQUE ("version", "organization_id"),
  CONSTRAINT "release_organization_id_slug_key" UNIQUE ("organization_id", "slug")
);

-- CreateTable deployment (depends on: deployment_zone, release, user, organization)
CREATE TABLE "deployment"
(
  "deployment_zone_id" UUID         NOT NULL,
  "release_id"         UUID         NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"      UUID         NOT NULL,
  "organization_id" UUID NOT NULL,

  CONSTRAINT "deployment_pkey" PRIMARY KEY ("deployment_zone_id", "release_id"),
  CONSTRAINT "deployment_deployment_zone_fkey" FOREIGN KEY ("deployment_zone_id") REFERENCES "deployment_zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "deployment_release_fkey" FOREIGN KEY ("release_id") REFERENCES "release" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "deployment_created_by_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "deployment_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable component (depends on: organization, user)
CREATE TABLE "component"
(
  "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
  "previous_component_id" UUID                  DEFAULT NULL,
  "name"                  VARCHAR      NOT NULL,
  "version"               VARCHAR      NOT NULL,
  "slug"                  TEXT         NOT NULL,
  "description"           TEXT,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"         UUID         NOT NULL,
  "organization_id" UUID NOT NULL,

  CONSTRAINT "component_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "component_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "component_created_by_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "component_name_version_unique" UNIQUE ("organization_id", "name", "version"),
  CONSTRAINT "component_organization_id_slug_key" UNIQUE ("organization_id", "slug")
);

-- CreateTable component_release (depends on: component, release, organization)
CREATE TABLE "component_release"
(
  "component_id" UUID NOT NULL,
  "release_id"   UUID NOT NULL,
  "organization_id" UUID NOT NULL,

  CONSTRAINT "component_on_release_pkey" PRIMARY KEY ("component_id", "release_id"),
  CONSTRAINT "component_release_component_fkey" FOREIGN KEY ("component_id") REFERENCES "component" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "component_release_release_fkey" FOREIGN KEY ("release_id") REFERENCES "release" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "component_release_organization_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable entitlement_group (depends on: organization)
CREATE TABLE "entitlement_group"
(
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "name"            TEXT NOT NULL,
  "slug"            TEXT NOT NULL,
  "description"     TEXT,
  "organization_id" UUID NOT NULL,

  CONSTRAINT "entitlement_group_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entitlement_group_organization_id_slug_key" UNIQUE ("organization_id", "slug"),
  CONSTRAINT "entitlement_group_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable entitlement_group_membership (depends on: entitlement_group, entitlement)
CREATE TABLE "entitlement_group_membership"
(
  "entitlement_group_id" UUID NOT NULL,
  "entitlement_id"       UUID NOT NULL,
  "organization_id"      UUID NOT NULL,

  CONSTRAINT "entitlement_group_membership_pkey" PRIMARY KEY ("entitlement_group_id", "entitlement_id"),
  CONSTRAINT "entitlement_group_membership_group_fkey" FOREIGN KEY ("entitlement_group_id") REFERENCES "entitlement_group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entitlement_group_membership_entitlement_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entitlement_group_membership_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_entitlement_group_membership_entitlement_id"
  ON "entitlement_group_membership" ("entitlement_id");

-- CreateTable customer_integrations (depends on: customer, organization)
CREATE TABLE "customer_integrations"
(
  "customer_id"      UUID         NOT NULL,
  "organization_id"  UUID         NOT NULL,
  "adapter"          TEXT         NOT NULL,
  "external_id"      TEXT         NOT NULL,
  "metadata"         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "synced_at"        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error"       TEXT,
  "web_url"          TEXT,

  CONSTRAINT "customer_integrations_pkey" PRIMARY KEY ("customer_id", "adapter"),
  CONSTRAINT "customer_integrations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_integrations_external_unique" UNIQUE ("organization_id", "adapter", "external_id")
);

CREATE INDEX "customer_integrations_org_adapter_idx" ON "customer_integrations" ("organization_id", "adapter");

-- CreateTable instance_integrations (depends on: instance, organization)
CREATE TABLE "instance_integrations"
(
  "instance_id"      UUID         NOT NULL,
  "organization_id"  UUID         NOT NULL,
  "adapter"          TEXT         NOT NULL,
  "external_id"      TEXT         NOT NULL,
  "metadata"         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "synced_at"        TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error"       TEXT,
  "web_url"          TEXT,

  CONSTRAINT "instance_integrations_pkey" PRIMARY KEY ("instance_id", "adapter"),
  CONSTRAINT "instance_integrations_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "instance_integrations_external_unique" UNIQUE ("organization_id", "adapter", "external_id")
);

CREATE INDEX "instance_integrations_org_adapter_idx" ON "instance_integrations" ("organization_id", "adapter");

-- CreateTable metadata_field (depends on: organization, user)
CREATE TABLE "metadata_field"
(
  "id"              UUID                           NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID                           NOT NULL,
  "resource_type"   "metadata_field_resource_type" NOT NULL,
  "key"             TEXT                           NOT NULL,
  "label"           TEXT                           NOT NULL,
  "json_schema"     JSONB                          NOT NULL,
  "display_order"   INTEGER                        NOT NULL DEFAULT 0,
  "archived_at"     TIMESTAMP(3),
  "created_at"      TIMESTAMP(3)                   NOT NULL DEFAULT now(),
  "created_by_id"   UUID                           NOT NULL,
  "updated_at"      TIMESTAMP(3)                   NOT NULL DEFAULT now(),
  "updated_by_id"   UUID                           NOT NULL,

  CONSTRAINT "metadata_field_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "metadata_field_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT "metadata_field_created_by_id_fkey"   FOREIGN KEY ("created_by_id")   REFERENCES "user" ("id")         ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "metadata_field_updated_by_id_fkey"   FOREIGN KEY ("updated_by_id")   REFERENCES "user" ("id")         ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Unique active key per (organization, resource_type) — soft-delete aware
CREATE UNIQUE INDEX "uq_metadata_field_key_active"
  ON "metadata_field" ("organization_id", "resource_type", "key")
  WHERE "archived_at" IS NULL;

-- Lookup index for listing active fields by (organization, resource_type)
CREATE INDEX "idx_metadata_field_org_resource"
  ON "metadata_field" ("organization_id", "resource_type")
  WHERE "archived_at" IS NULL;

-- CreateTable connector (no dependencies)
CREATE TABLE "connector"
(
  "name"            TEXT         NOT NULL,
  "version"         TEXT         NOT NULL,
  "settings_schema" JSONB        NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "connector_pkey" PRIMARY KEY ("name"),
  CONSTRAINT "connector_settings_schema_type_check" CHECK (jsonb_typeof("settings_schema") = 'object')
);

-- Add function & trigger in order to auto-increment license version
-- +goose StatementBegin
DROP FUNCTION IF EXISTS update_license_version() CASCADE;
CREATE FUNCTION update_license_version()
  RETURNS TRIGGER
  LANGUAGE PLPGSQL
AS $$
BEGIN
SELECT COALESCE(MAX(version) + 1, 1)
INTO NEW.version
FROM public."license"
WHERE name = NEW.name
  AND "organization_id" = NEW."organization_id";
SELECT COALESCE(NEW."version_name", CONCAT('Version - ', COALESCE(MAX(version) + 1, 1)))
INTO NEW."version_name"
FROM public."license"
WHERE name = NEW.name
  AND "organization_id" = NEW."organization_id";
RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_license_version_trigger ON "license";
CREATE TRIGGER update_license_version_trigger
  BEFORE INSERT
  ON public."license"
  FOR EACH ROW EXECUTE PROCEDURE update_license_version();
-- +goose StatementEnd

-- +goose Down
-- Drop trigger and function
DROP TRIGGER IF EXISTS update_license_version_trigger ON "license";
DROP FUNCTION IF EXISTS update_license_version CASCADE;
DROP TRIGGER IF EXISTS trg_ensure_kaiten_system_user_membership_on_org ON "organization";
DROP FUNCTION IF EXISTS ensure_kaiten_system_user_membership_for_org();

-- Drop indexes
DROP INDEX IF EXISTS "idx_unique_machine_slug_per_org";
DROP INDEX IF EXISTS "idx_token_lookup_hash_active";
DROP INDEX IF EXISTS "customer_org_external_id_idx";
DROP INDEX IF EXISTS "idx_entitlement_group_membership_entitlement_id";
DROP INDEX IF EXISTS "idx_audit_trail_org_instance";
DROP INDEX IF EXISTS "idx_audit_trail_occurred_at";
DROP INDEX IF EXISTS "customer_integrations_org_adapter_idx";
DROP INDEX IF EXISTS "instance_integrations_org_adapter_idx";
DROP INDEX IF EXISTS "uq_metadata_field_key_active";
DROP INDEX IF EXISTS "idx_metadata_field_org_resource";

-- Drop tables (in reverse order of creation)
DROP TABLE IF EXISTS "connector" CASCADE;
DROP TABLE IF EXISTS "metadata_field" CASCADE;
DROP TABLE IF EXISTS "instance_integrations" CASCADE;
DROP TABLE IF EXISTS "customer_integrations" CASCADE;
DROP TABLE IF EXISTS "entitlement_group_membership" CASCADE;
DROP TABLE IF EXISTS "entitlement_group" CASCADE;
DROP TABLE IF EXISTS "component_release" CASCADE;
DROP TABLE IF EXISTS "component" CASCADE;
DROP TABLE IF EXISTS "deployment" CASCADE;
DROP TABLE IF EXISTS "release" CASCADE;
DROP TABLE IF EXISTS "outbox_events" CASCADE;
DROP TABLE IF EXISTS "token" CASCADE;
DROP TABLE IF EXISTS "feature_flags" CASCADE;
DROP TABLE IF EXISTS "audit_trail" CASCADE;
DROP TABLE IF EXISTS "entitlement_usage" CASCADE;
DROP TABLE IF EXISTS "instance" CASCADE;
DROP TABLE IF EXISTS "deployment_zone" CASCADE;
DROP TABLE IF EXISTS "license_entitlement" CASCADE;
DROP TABLE IF EXISTS "entitlement" CASCADE;
DROP TABLE IF EXISTS "license" CASCADE;
DROP TABLE IF EXISTS "customer" CASCADE;
DROP TABLE IF EXISTS "user_on_organization" CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
DROP TABLE IF EXISTS "organization" CASCADE;

-- Drop ENUM types
DROP TYPE IF EXISTS "license_type" CASCADE;
DROP TYPE IF EXISTS "entitlement_type" CASCADE;
DROP TYPE IF EXISTS "entitlement_enforcement_mode" CASCADE;
DROP TYPE IF EXISTS "meter_type" CASCADE;
DROP TYPE IF EXISTS "aggregation_method" CASCADE;
DROP TYPE IF EXISTS "user_type" CASCADE;
DROP TYPE IF EXISTS "metadata_field_resource_type" CASCADE;
DROP TYPE IF EXISTS "instance_status" CASCADE;
