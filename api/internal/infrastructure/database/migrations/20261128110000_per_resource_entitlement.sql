-- +goose Up
-- +goose StatementBegin
-- Per-resource entitlements. limit_scope says what an entitlement's limit applies
-- to: the instance (one counter, as always) or each resource of the instance (one
-- counter per resource, every one measured against the same limit).
--
-- NOT NULL DEFAULT, like warning_threshold_percent: every existing row, and any
-- INSERT that does not name the column, is INSTANCE. The API only ever returns or
-- accepts the field for the NUMBER family, and the constraint below keeps RESOURCE
-- to NUMBER.
CREATE TYPE "entitlement_limit_scope" AS ENUM ('INSTANCE', 'RESOURCE');

ALTER TABLE "entitlement"
  ADD COLUMN "limit_scope" "entitlement_limit_scope" NOT NULL DEFAULT 'INSTANCE';

-- RESOURCE is NUMBER only: a NUMBER_AI_CREDIT pool is one balance per instance,
-- and BOOLEAN and CONFIG have no counter at all. limit_scope is immutable once the
-- entitlement exists (the update handler refuses a change).
ALTER TABLE "entitlement"
  ADD CONSTRAINT "entitlement_limit_scope_resource_check" CHECK (
    "limit_scope" = 'INSTANCE' OR "type" = 'NUMBER'
  );

-- One counter per (instance, entitlement, resource). value and period_start are
-- those of entitlement_usage, and every window decision is the entitlement's: a
-- resource has its own window start, the reset configuration is shared.
--
-- The pair's entitlement_usage row stays the entitlement's own row. For a RESOURCE
-- entitlement it holds a summary the report path rewrites in the transaction of
-- every write: the highest counter among the resources that sit in the window the
-- write landed in, and the pair's report_seq. So every reader of entitlement_usage
-- (the gauges, the dashboard, the targeting facts, the quota check of a plan
-- change) keeps reading one row per entitlement, and reads the resource closest to
-- its limit. The journal's key (instance_id, entitlement_id, report_seq) does not
-- change either: one sequence per pair, whatever the number of resources.
--
-- resource_key is the vendor's own identifier for the object, in the alphabet of
-- Idempotency-Key: 1 to 128 characters of [A-Za-z0-9._:-], case-sensitive: COLLATE
-- "C" makes the order of the list the bytes' order, whatever the database's locale
-- is. "." and ".." are no keys: a dot segment is normalized away by HTTP clients
-- and proxies, so such a resource could not be addressed under
-- /resources/{resourceKey}.
--
-- Usage follows its entitlement and its instance out, like entitlement_usage
-- (20261012000000_entitlement_usage_follows_its_entitlement.sql).
CREATE TABLE "entitlement_resource_usage"
(
  "entitlement_id"  UUID         NOT NULL,
  "instance_id"     UUID         NOT NULL,
  "resource_key"    TEXT COLLATE "C" NOT NULL,
  "organization_id" UUID         NOT NULL,
  "value"           JSONB        NOT NULL,
  "period_start"    TIMESTAMP(3),

  CONSTRAINT "entitlement_resource_usage_pkey" PRIMARY KEY ("entitlement_id", "instance_id", "resource_key"),
  CONSTRAINT "entitlement_resource_usage_resource_key_check" CHECK (
    "resource_key" ~ '^[A-Za-z0-9._:-]{1,128}$' AND "resource_key" NOT IN ('.', '..')
  ),
  CONSTRAINT "entitlement_resource_usage_value_check" CHECK (
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
  CONSTRAINT "entitlement_resource_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entitlement_resource_usage_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "entitlement_resource_usage_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "instance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Deleting an instance cascades by instance_id, and the primary key starts with
-- entitlement_id: without this index each such delete would scan the table.
CREATE INDEX "idx_entitlement_resource_usage_instance" ON "entitlement_resource_usage" ("instance_id");

-- The journal says which resource a report counted for: NULL for an INSTANCE
-- entitlement, which is every row written so far. ADD COLUMN without a default
-- is a catalog change, and the CHECK is NOT VALID so that no partition is scanned
-- under an exclusive lock: the rows already there are all NULL, and every row
-- written from now on is checked. No index: a filtered read scans the pair's
-- reports in report_seq order within the range, as an unfiltered one does.
ALTER TABLE "usage_ledger" ADD COLUMN "resource_key" TEXT;

ALTER TABLE "usage_ledger"
  ADD CONSTRAINT "usage_ledger_resource_key_check" CHECK (
    "resource_key" IS NULL
      OR ("resource_key" ~ '^[A-Za-z0-9._:-]{1,128}$' AND "resource_key" NOT IN ('.', '..'))
    ) NOT VALID;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Drops the per-resource counters and the resource of every journal row: neither is
-- recoverable. An entitlement that was per resource reads as a per-instance one
-- afterwards, with the counter its pair row held (the highest resource's).
ALTER TABLE "usage_ledger" DROP CONSTRAINT IF EXISTS "usage_ledger_resource_key_check";
ALTER TABLE "usage_ledger" DROP COLUMN IF EXISTS "resource_key";

DROP TABLE IF EXISTS "entitlement_resource_usage";

ALTER TABLE "entitlement" DROP CONSTRAINT IF EXISTS "entitlement_limit_scope_resource_check";
ALTER TABLE "entitlement" DROP COLUMN IF EXISTS "limit_scope";

DROP TYPE IF EXISTS "entitlement_limit_scope";
-- +goose StatementEnd
