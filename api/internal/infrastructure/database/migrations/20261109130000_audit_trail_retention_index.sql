-- +goose NO TRANSACTION
-- +goose Up
-- The audit trail's retention pass (internal/modules/audittrail/auditretention)
-- reads an organization's oldest entries, in order, a batch at a time. No other
-- index serves that: idx_audit_trail_feed puts event_name before occurred_at, so
-- every batch would sort the whole backlog, and idx_audit_trail_occurred_at walks
-- every organization's old rows, the keep-forever ones included.
--
-- CONCURRENTLY, and so outside a transaction, because audit_trail takes a write
-- for every domain event and a plain build would block them all. A build that
-- fails leaves an invalid index behind, which the DROP clears on a retry.
DROP INDEX CONCURRENTLY IF EXISTS "idx_audit_trail_org_occurred_at";
CREATE INDEX CONCURRENTLY "idx_audit_trail_org_occurred_at" ON "audit_trail" ("organization_id", "occurred_at", "id");

-- +goose Down
DROP INDEX CONCURRENTLY IF EXISTS "idx_audit_trail_org_occurred_at";
