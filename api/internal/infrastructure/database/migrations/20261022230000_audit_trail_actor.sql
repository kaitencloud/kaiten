-- +goose Up
-- +goose StatementBegin
-- The user each audit entry is recorded under (§5 Conventions, E-27): the
-- caller, the vendor principal behind a customer session, or system:kaiten,
-- shown as "Kaiten (system)". The outbox carries it in the event headers.
-- Entries written before this migration have none. A user is only
-- soft-deleted, so SET NULL never fires in practice.
ALTER TABLE "audit_trail"
  ADD COLUMN "actor_id" UUID;
ALTER TABLE "audit_trail"
  ADD CONSTRAINT "audit_trail_actor_id_fkey" FOREIGN KEY ("actor_id")
    REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "audit_trail" DROP CONSTRAINT IF EXISTS "audit_trail_actor_id_fkey";
ALTER TABLE "audit_trail" DROP COLUMN IF EXISTS "actor_id";
-- +goose StatementEnd
