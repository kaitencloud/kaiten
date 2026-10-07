-- +goose Up
-- +goose StatementBegin
-- The usage journal: one row per ACCEPTED usage report.
--
-- The report use case (reportentitlementusagemetric), the only production
-- writer of usage, writes the row inside the transaction that already holds the
-- pair's pg_advisory_xact_lock and the entitlement_usage row FOR UPDATE. There
-- is no CDC hop: the row commits or rolls back with the counter it explains, so
-- the journal is complete on a deployment that runs no Debezium or Dapr. A
-- REJECTED report writes no row.
--
-- report_seq is the pair's report counter, carried by entitlement_usage and
-- copied onto the journal row: +1 per ACCEPTED report, never reset -- not by a
-- window rollover, not by a downward set. A gap in a pair's report_seq means a
-- writer bypassed the use case. Existing counters start at 0, so the first
-- journalled report of every pair, old or new, carries 1.
ALTER TABLE "entitlement_usage" ADD COLUMN "report_seq" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "entitlement_usage"
  ADD CONSTRAINT "entitlement_usage_report_seq_check" CHECK ("report_seq" >= 0);

-- The report's behavior, lower case as in the API.
CREATE TYPE "usage_report_behavior" AS ENUM ('append', 'set');

-- When the journal started. A reset window opened after this instant has every
-- report journalled, so its first row starts at 0; one opened before it may
-- hold reports that were never journalled. One row, written here and never
-- again.
CREATE TABLE "usage_ledger_epoch"
(
  "singleton" BOOLEAN      NOT NULL DEFAULT TRUE,
  "epoch_at"  TIMESTAMP(3) NOT NULL DEFAULT date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC'),

  CONSTRAINT "usage_ledger_epoch_pkey" PRIMARY KEY ("singleton"),
  CONSTRAINT "usage_ledger_epoch_singleton_check" CHECK ("singleton")
);
INSERT INTO "usage_ledger_epoch" DEFAULT VALUES;

-- No foreign key to instance, entitlement or license: the journal is evidence
-- of what was counted, so it outlives a deleted instance or customer
-- (entitlement_usage itself cascades away with the instance), and a RESTRICT on
-- entitlement would make an entitlement undeletable for as long as its rows are
-- kept. organization is the only parent: deleting an organization erases its
-- journal like everything else it owns.
--
-- reported_at is the instant the report was accepted: the usage clock,
-- date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC'), read once
-- after the pair's lock. It is also the partition key.
--
-- window_start/window_end are the reset window the counter was in after any
-- lazy rollover, NULL for a lifetime counter. There is deliberately no
-- "window_start <= reported_at" check: a stored window that is ahead of the
-- clock stays current (period.ResolveCurrent), and the journal records what the
-- counter did rather than failing the report.
--
-- value_before is the counter after any rollover reset and before this report,
-- value_after the committed counter after it: absolute values for both
-- behaviors, so the sum of (value_after - value_before) over a window is exact
-- for append and set alike. Written from Go with the shortest decimal that
-- round-trips the float64 counter, never through float8::numeric in SQL.
--
-- limit_value/overage_percent are the quota and overage policy the gate applied
-- to this very report: limit_value NULL means unlimited, and then
-- overage_percent is -1.
--
-- properties is the report's metadata, stored when its serialized size is at
-- most 4 KiB. The 4 KiB rule is the application's, measured on its own compact
-- encoding; this CHECK is a backstop at twice that, because jsonb::text
-- re-renders with spaces. Not indexed.
CREATE TABLE "usage_ledger"
(
  "organization_id"    UUID                    NOT NULL,
  "instance_id"        UUID                    NOT NULL,
  "entitlement_id"     UUID                    NOT NULL,
  "license_id"         UUID                    NOT NULL,
  "report_seq"         BIGINT                  NOT NULL,
  "reported_at"        TIMESTAMP(3)            NOT NULL,
  "window_start"       TIMESTAMP(3),
  "window_end"         TIMESTAMP(3),
  "behavior"           "usage_report_behavior" NOT NULL,
  "aggregation_method" "aggregation_method"    NOT NULL,
  "reported_value"     NUMERIC                 NOT NULL,
  "value_before"       NUMERIC                 NOT NULL,
  "value_after"        NUMERIC                 NOT NULL,
  "event_count_after"  INTEGER                 NOT NULL,
  "limit_value"        NUMERIC,
  "overage_percent"    SMALLINT                NOT NULL,
  "transaction_id"     TEXT,
  "properties"         JSONB,

  -- A partitioned table's primary key must contain the partition key.
  -- (instance_id, entitlement_id, report_seq) is the logical key; reported_at
  -- rides along. The index also serves paging by report_seq.
  CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("instance_id", "entitlement_id", "report_seq", "reported_at"),
  CONSTRAINT "usage_ledger_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "usage_ledger_report_seq_check" CHECK ("report_seq" >= 1),
  CONSTRAINT "usage_ledger_window_check" CHECK (
    ("window_start" IS NULL AND "window_end" IS NULL)
      OR
    ("window_start" IS NOT NULL AND "window_end" IS NOT NULL AND "window_start" < "window_end")
    ),
  CONSTRAINT "usage_ledger_event_count_after_check" CHECK ("event_count_after" >= 0),
  CONSTRAINT "usage_ledger_limit_check" CHECK (
    ("limit_value" IS NULL AND "overage_percent" = -1)
      OR
    ("limit_value" IS NOT NULL AND "limit_value" >= 0 AND "overage_percent" >= 0)
    ),
  CONSTRAINT "usage_ledger_transaction_id_check" CHECK (
    "transaction_id" IS NULL OR "transaction_id" ~ '^[A-Za-z0-9._:-]{1,128}$'
    ),
  CONSTRAINT "usage_ledger_properties_check" CHECK (
    "properties" IS NULL
      OR
    (jsonb_typeof("properties") = 'object' AND octet_length("properties"::text) <= 8192)
    )
) PARTITION BY RANGE ("reported_at");

-- One range scan per pair and period, index-only for sums over the journal.
-- Partition pruning on reported_at keeps it to the months asked for.
CREATE INDEX "idx_usage_ledger_pair_reported_at"
  ON "usage_ledger" ("instance_id", "entitlement_id", "reported_at")
  INCLUDE ("report_seq", "window_start", "window_end", "value_before", "value_after", "limit_value");

-- The idempotency-key lookup, under the pair's lock: (instance_id,
-- entitlement_id, transaction_id) within a recent horizon of reported_at. Not
-- UNIQUE: a unique index on a partitioned table must include reported_at, which
-- would make it unique per instant rather than per key; uniqueness within the
-- horizon comes from the lookup running under the pair's advisory lock.
CREATE INDEX "idx_usage_ledger_transaction_id"
  ON "usage_ledger" ("instance_id", "entitlement_id", "transaction_id", "reported_at")
  WHERE "transaction_id" IS NOT NULL;

-- Per-organization retention: the batched DELETE for organizations that keep
-- their journal for less time than the partitions are kept.
CREATE INDEX "idx_usage_ledger_org_reported_at"
  ON "usage_ledger" ("organization_id", "reported_at");

-- Monthly partitions relative to the migration instant, not to the date this
-- file was written: current month - 1 through current month + 12, so an
-- installation that migrates years from now is as covered as one that migrates
-- today. No DEFAULT partition: a report dated outside every partition must fail
-- loudly rather than land in a catch-all that dropping partitions could never
-- purge. Partition names: usage_ledger_pYYYY_MM.
DO $$
DECLARE
  first_month DATE := (date_trunc('month', now() AT TIME ZONE 'UTC') - INTERVAL '1 month')::date;
  month_start DATE;
BEGIN
  FOR k IN 0..13 LOOP
    month_start := (first_month + make_interval(months => k))::date;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "usage_ledger" FOR VALUES FROM (%L) TO (%L)',
      'usage_ledger_p' || to_char(month_start, 'YYYY_MM'),
      month_start::timestamp(3),
      (month_start + INTERVAL '1 month')::timestamp(3));
  END LOOP;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Drops the journal and every partition with it: the usage history recorded
-- while this migration was applied is not recoverable.
DROP TABLE IF EXISTS "usage_ledger";
DROP TABLE IF EXISTS "usage_ledger_epoch";
DROP TYPE IF EXISTS "usage_report_behavior";
ALTER TABLE "entitlement_usage" DROP CONSTRAINT IF EXISTS "entitlement_usage_report_seq_check";
ALTER TABLE "entitlement_usage" DROP COLUMN IF EXISTS "report_seq";
-- +goose StatementEnd
