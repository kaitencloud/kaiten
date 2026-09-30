-- +goose Up
-- +goose StatementBegin
-- The token table's UNIQUE constraint guarded the wrong column.
-- "hash" is a salted bcrypt digest (internal/shared/token/hash.go), so two
-- rows for the same plaintext produce different digests and token_hash_key
-- can never fire -- it enforces nothing. Meanwhile "lookup_hash", the
-- deterministic SHA-256 the exchange actually resolves a token by, carried
-- only a plain index. GetActiveTokenByLookupHash is a :one query, and pgx's
-- QueryRow returns the FIRST row without error, so two active rows sharing
-- a lookup_hash would authenticate as an arbitrary one of two identities --
-- potentially in different organizations -- with no error anywhere.
--
-- Any pre-existing duplicate is revoked rather than deleted: revocation is
-- the domain's own way of retiring a token, it keeps the audit row, and the
-- uniqueness is only needed among ACTIVE tokens. The newest active row per
-- lookup_hash survives; id breaks ties deterministically.
UPDATE "token" superseded
SET "revoked_date" = now()
WHERE superseded."revoked_date" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "token" kept
    WHERE kept."lookup_hash" = superseded."lookup_hash"
      AND kept."revoked_date" IS NULL
      AND (kept."created_at", kept."id") > (superseded."created_at", superseded."id")
  );

-- Recreated as UNIQUE with the same name, predicate and INCLUDE list: one
-- index still covers the exchange's index-only read AND enforces the
-- invariant, rather than carrying a second redundant index alongside it.
DROP INDEX "idx_token_lookup_hash_active";
CREATE UNIQUE INDEX "idx_token_lookup_hash_active"
  ON "token" ("lookup_hash")
  INCLUDE ("hash", "service_account_id", "organization_id", "scopes", "expires_at")
  WHERE "revoked_date" IS NULL;

ALTER TABLE "token" DROP CONSTRAINT "token_hash_key";
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "token" ADD CONSTRAINT "token_hash_key" UNIQUE ("hash");

DROP INDEX "idx_token_lookup_hash_active";
CREATE INDEX "idx_token_lookup_hash_active"
  ON "token" ("lookup_hash")
  INCLUDE ("hash", "service_account_id", "organization_id", "scopes", "expires_at")
  WHERE "revoked_date" IS NULL;
-- +goose StatementEnd
