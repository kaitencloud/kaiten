-- +goose Up
-- +goose StatementBegin
-- Publishable keys (Tier 1 of the public SDK surface, D-49): the credential a
-- vendor's web page sends to read its own public catalogue. A key is not a
-- secret -- it ships in page source -- so it is bound by what it can reach
-- (GET /api/public/catalog, nothing else) and by the browser origins allowed
-- to use it, not by being hidden.
--
-- Only the SHA-256 digest of the plaintext is stored, the digest
-- shared/token.LookupHash computes. No bcrypt: 32 random bytes make preimage
-- search the binding cost, and bcrypt on every public request is unaffordable.
-- key_hint keeps the last four characters so the console can tell keys apart.
--
-- allowed_origins is the key's CORS policy, enforced on the actual request:
-- empty means no browser origin may use the key (server-to-server reads, which
-- send no Origin, still may).
CREATE TABLE "publishable_key"
(
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID         NOT NULL,
  "label"           TEXT         NOT NULL,
  "lookup_hash"     TEXT         NOT NULL,
  "key_hint"        TEXT         NOT NULL,
  "allowed_origins" TEXT[]       NOT NULL DEFAULT '{}',
  "last_used_at"    TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id"   UUID         NOT NULL,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by_id"   UUID         NOT NULL,
  "revoked_at"      TIMESTAMP(3),
  "revoked_by_id"   UUID,
  CONSTRAINT "publishable_key_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publishable_key_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "publishable_key_created_by_id_fkey" FOREIGN KEY ("created_by_id")
    REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "publishable_key_updated_by_id_fkey" FOREIGN KEY ("updated_by_id")
    REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "publishable_key_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id")
    REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "publishable_key_label_check" CHECK (char_length("label") BETWEEN 1 AND 100),
  CONSTRAINT "publishable_key_lookup_hash_check" CHECK ("lookup_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "publishable_key_key_hint_check" CHECK (char_length("key_hint") = 4),
  CONSTRAINT "publishable_key_allowed_origins_check" CHECK (
    cardinality("allowed_origins") <= 50 AND array_position("allowed_origins", NULL) IS NULL
    ),
  CONSTRAINT "publishable_key_revoked_check" CHECK (("revoked_at" IS NULL) = ("revoked_by_id" IS NULL))
);

-- The authentication lookup: at most one live key per digest, answered from the
-- index alone. Revocation is terminal for a row, and a revoked digest may be
-- reused by a new one.
CREATE UNIQUE INDEX "idx_publishable_key_lookup_hash_active"
  ON "publishable_key" ("lookup_hash") INCLUDE ("organization_id", "allowed_origins")
  WHERE "revoked_at" IS NULL;

CREATE INDEX "idx_publishable_key_organization_created_at"
  ON "publishable_key" ("organization_id", "created_at" DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "publishable_key";
-- +goose StatementEnd
