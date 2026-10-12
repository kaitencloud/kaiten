-- +goose Up
-- +goose StatementBegin
-- An entitlement that had ever been reported against could not be deleted.
-- entitlement_usage referenced it ON DELETE RESTRICT, and nothing in the API
-- deletes usage rows, so the only way to retire an entitlement from a catalogue
-- was to go to the database. Usage is a counter OF the entitlement: with the
-- entitlement gone it measures nothing, and no other row reads it.
--
-- license_entitlement keeps its RESTRICT. A grant is a commercial decision
-- somebody made on a licence, and an entitlement a licence still grants must
-- not disappear from under it -- DeleteEntitlement answers 409 instead, and
-- the caller removes the grants first.
ALTER TABLE "entitlement_usage"
  DROP CONSTRAINT "entitlement_usage_entitlement_id_fkey",
  ADD CONSTRAINT "entitlement_usage_entitlement_id_fkey"
    FOREIGN KEY ("entitlement_id") REFERENCES "entitlement" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "entitlement_usage"
  DROP CONSTRAINT "entitlement_usage_entitlement_id_fkey",
  ADD CONSTRAINT "entitlement_usage_entitlement_id_fkey"
    FOREIGN KEY ("entitlement_id") REFERENCES "entitlement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- +goose StatementEnd
