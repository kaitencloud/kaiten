-- +goose Up
-- +goose StatementBegin
-- license_entitlement carried no uniqueness over
-- (license_id, entitlement_id), so the same entitlement could be associated
-- with the same license more than once. The enforcement path reads the
-- threshold with a single-row lookup (GetEntitlementContextBySlug), so with
-- duplicates present the applied cap is whichever row Postgres happens to
-- return -- a limit that changes across queries and plan changes, and an
-- entitlement list the client sees twice.
--
-- De-duplication runs first, keeping the most recently updated row per
-- pair; id breaks ties so the choice is deterministic rather than
-- dependent on physical order. organization_id is not part of the key:
-- license and entitlement are both organization-scoped already, so a pair
-- cannot span two tenants.
DELETE FROM "license_entitlement" duplicate
WHERE EXISTS (
  SELECT 1
  FROM "license_entitlement" kept
  WHERE kept."license_id" = duplicate."license_id"
    AND kept."entitlement_id" = duplicate."entitlement_id"
    AND (kept."updated_at", kept."id") > (duplicate."updated_at", duplicate."id")
);

ALTER TABLE "license_entitlement"
  ADD CONSTRAINT "license_entitlement_license_id_entitlement_id_key" UNIQUE ("license_id", "entitlement_id");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- The dropped duplicates are not restorable; only the constraint comes back.
ALTER TABLE "license_entitlement" DROP CONSTRAINT "license_entitlement_license_id_entitlement_id_key";
-- +goose StatementEnd
