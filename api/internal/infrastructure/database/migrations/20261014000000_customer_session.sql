-- +goose Up
-- +goose StatementBegin
-- Customer sessions (Tier 3 of the public SDK surface, D-49): the credential a
-- vendor's backend mints for one of its customers -- optionally one of that
-- customer's instances -- and hands to the browser, which presents it as
-- Authorization: Bearer kst_... on /api/public/session/* and nowhere else.
--
-- Like a publishable key, only the SHA-256 digest of the plaintext is stored.
-- Unlike one, a session is short-lived: 5 to 60 minutes, the bound on how long
-- a token leaked from a browser stays usable. It is revocable before that.
--
-- created_by_id is the vendor principal that minted the session, and the actor
-- of every write the session makes: Kaiten cannot tell the vendor's end users
-- apart, so a write is attributed to whoever vouched for them.
--
-- No event is emitted for sessions (D-56): one per page view would drown the
-- audit trail. Expired rows are deleted as new sessions are minted.
CREATE TABLE "customer_session"
(
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID         NOT NULL,
  "customer_id"     UUID         NOT NULL,
  "instance_id"     UUID,
  "lookup_hash"     TEXT         NOT NULL,
  "created_by_id"   UUID         NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"      TIMESTAMP(3) NOT NULL,
  "revoked_at"      TIMESTAMP(3),
  "revoked_by_id"   UUID,
  CONSTRAINT "customer_session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_session_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_session_customer_id_fkey" FOREIGN KEY ("customer_id")
    REFERENCES "customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_session_instance_id_fkey" FOREIGN KEY ("instance_id")
    REFERENCES "instance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_session_created_by_id_fkey" FOREIGN KEY ("created_by_id")
    REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_session_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id")
    REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "customer_session_lookup_hash_check" CHECK ("lookup_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "customer_session_ttl_check" CHECK (
    "expires_at" >= "created_at" + INTERVAL '5 minutes'
      AND "expires_at" <= "created_at" + INTERVAL '60 minutes'
    )
);

-- The authentication lookup: at most one live session per digest. Expiry is
-- checked by the query, not the index, since "live" moves with the clock.
CREATE UNIQUE INDEX "idx_customer_session_lookup_hash_active"
  ON "customer_session" ("lookup_hash")
  INCLUDE ("organization_id", "customer_id", "instance_id", "expires_at")
  WHERE "revoked_at" IS NULL;

-- The purge of expired sessions, per organization.
CREATE INDEX "idx_customer_session_organization_expires_at"
  ON "customer_session" ("organization_id", "expires_at");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "customer_session";
-- +goose StatementEnd
