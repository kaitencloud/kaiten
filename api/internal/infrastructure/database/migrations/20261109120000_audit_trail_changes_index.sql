-- +goose NO TRANSACTION

-- +goose Up
-- The access path of ListOrganizationChanges: one organization's trail, newest
-- first, without the reads, evaluations and reports SDKs produce in bulk. No
-- other index serves it: walking (occurred_at DESC) or (organization_id,
-- occurred_at) to find a hundred changes reads past every SDK event on the way.
-- Partial, so it stays small and the bulk events never write to it. The list is
-- the query's, character for character (see changes_index_test.go): the planner
-- only uses this index when it can prove the query's filter implies this one.
--
-- CONCURRENTLY because audit_trail is written on every SDK read, which is why
-- this file runs outside a transaction. An interrupted build leaves an invalid
-- index under this name, so a retry drops it first.
DROP INDEX CONCURRENTLY IF EXISTS "idx_audit_trail_changes";
CREATE INDEX CONCURRENTLY "idx_audit_trail_changes"
  ON "audit_trail" ("organization_id", "occurred_at" DESC, "id" DESC)
  WHERE "event_name" <> ALL('{ENTITLEMENT_VALUE_GET,ENTITLEMENT_USAGE_REPORT_ACCEPTED,ENTITLEMENT_USAGE_REPORT_REJECTED,FEATURE_FLAG_EVALUATED,INSTANCE_ENTITLEMENT_USAGE_PERIOD_ROLLED_OVER,INSTANCE_ENTITLEMENT_USAGE_WARNING_THRESHOLD_REACHED,INSTANCE_ENTITLEMENT_USAGE_REACHED,INSTANCE_ENTITLEMENT_CAP_EXCEEDED}'::text[]);

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS "idx_audit_trail_changes";
