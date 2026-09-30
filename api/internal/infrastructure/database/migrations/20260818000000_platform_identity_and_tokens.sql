-- +goose Up
-- +goose StatementBegin
-- The platform identity and the credential class that authenticates it.
--
-- Every credential in this schema was organization-scoped by construction:
-- token.organization_id was NOT NULL, and the internal JWT that authenticates a
-- request requires a kaiten_external_org_id claim. So Kaiten had no way to
-- authenticate *itself* -- anything platform-wide (provisioning a tenant's
-- credentials, deleting an organization, minting the dogfooding token) was done
-- by hand through the UI or by the seeder reaching in with raw SQL.
--
-- This adds one identity that has none of that context, and one token kind that
-- carries it. The separation the rest of the change rests on:
--
--   authentication identity        !=      organization execution context
--        system:kaiten                            none      (platform token)
--        system:kaiten                            {orgId}   (minted org token)
--
-- The identity is created HERE rather than seeded because it must exist before
-- the first start of the application, and before any organization -- which is
-- what makes the membership trigger below reliable from the very first tenant.

-- The one identity allowed to be a machine user with no organization: it is the
-- platform itself, not a tenant's service account. Every other machine user
-- still requires an organization.
ALTER TABLE "user" DROP CONSTRAINT "user_organization_id_machine_check";
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_machine_check" CHECK (
  "type" <> 'machine'
  OR "organization_id" IS NOT NULL
  OR "external_id" = 'system:kaiten');

-- ...and the one machine user allowed an email address, for the same reason: it
-- is a named platform actor that appears in membership lists and audit payloads,
-- not an anonymous per-tenant credential holder. Tenant service accounts stay
-- email-less, which is what keeps "user_email_key" a register of real people
-- plus this one platform identity -- and, because that key is UNIQUE, what makes
-- system@kaiten.sh a reserved address: a human JIT-provisioning with it gets
-- 409 Auth.EmailAlreadyProvisioned instead of colliding with the platform.
ALTER TABLE "user" DROP CONSTRAINT "user_email_machine_check";
ALTER TABLE "user" ADD CONSTRAINT "user_email_machine_check" CHECK (
  "type" <> 'machine'
  OR "email" IS NULL
  OR "external_id" = 'system:kaiten');

-- 20260815130000_remove_misleading_schema.sql documents this column as "Machine
-- accounts only"; the exemption above makes that incomplete, and sqlc copies the
-- comment verbatim into generated Go, so restate it here.
COMMENT ON COLUMN "user"."organization_id" IS
  'Machine accounts only, except the system:kaiten platform identity (see user_organization_id_machine_check). Not read by any application query - membership is resolved via user_on_organization. Kept because idx_unique_machine_slug_per_org depends on it for per-organization slug uniqueness.';

-- idx_unique_machine_slug_per_org is ON (slug, organization_id), so it stops
-- enforcing anything once organization_id is NULL -- NULLs are distinct in a
-- unique index. Orgless machine slugs need their own.
CREATE UNIQUE INDEX "idx_unique_orgless_machine_slug"
  ON "user" ("slug")
  WHERE "type" = 'machine' AND "organization_id" IS NULL;

-- Converts the pre-existing human row where one is present (the seeder used to
-- write it), keeping the email and name it already had: a platform identity that
-- shows up in a membership list as Kaiten <system@kaiten.sh> is legible, one
-- that shows up as an anonymous machine row with a NULL email is not.
--
-- ON CONFLICT ("external_id"), not ("id") as the seeder used: external_id is the
-- identity, and a database where the row exists under a different id must
-- converge on the identity rather than fork a second one. The values are set
-- unconditionally rather than COALESCEd, so a hand-edited row converges too. If
-- some other row already holds system@kaiten.sh this fails on "user_email_key",
-- loudly, at deploy time -- the correct outcome for two identities claiming one
-- address.
--
-- The slug contains a colon, which the service-account slug pattern
-- (^[a-z0-9][a-z0-9-]*[a-z0-9]$, enforced in internal/shared/slugutil) forbids:
-- no tenant can ever create a service account that collides with it.
INSERT INTO "user" ("id", "external_id", "name", "slug", "type", "email", "organization_id")
VALUES ('00000000-0000-0000-0000-000000000001'::uuid,
        'system:kaiten', 'Kaiten', 'system:kaiten', 'machine', 'system@kaiten.sh', NULL)
ON CONFLICT ("external_id") DO UPDATE
SET "type"            = 'machine',
    "name"            = 'Kaiten',
    "email"           = 'system@kaiten.sh',
    "slug"            = 'system:kaiten',
    "organization_id" = NULL,
    "deleted_at"      = NULL;
-- +goose StatementEnd

-- +goose StatementBegin
-- Was: IF NEW."id" <> '00000000-0000-0000-0000-000000000001'::uuid -- comparing
-- the ORGANIZATION being inserted against the system USER's id constant. That
-- uuid is also TMNT HQ's organization id in dev data, so that one tenant
-- silently never got a membership. Resolve the user by external_id instead,
-- which is the identity, and drop the guard entirely.
CREATE OR REPLACE FUNCTION ensure_kaiten_system_user_membership_for_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  system_user_id UUID;
BEGIN
  SELECT "id" INTO system_user_id
  FROM "user"
  WHERE "external_id" = 'system:kaiten';

  IF system_user_id IS NOT NULL THEN
    INSERT INTO "user_on_organization" ("organization_id", "user_id", "deleted_at")
    VALUES (NEW."id", system_user_id, NULL)
    ON CONFLICT ("organization_id", "user_id") DO UPDATE
    SET "deleted_at" = NULL;
  END IF;

  RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
-- One-time backfill: the trigger is AFTER INSERT only, so every organization
-- that predates the system user has no membership at all. organization has had
-- no deleted_at since 20260816030000 -- every row here is live.
INSERT INTO "user_on_organization" ("organization_id", "user_id")
SELECT o."id", u."id"
FROM "organization" o, "user" u
WHERE u."external_id" = 'system:kaiten'
ON CONFLICT ("organization_id", "user_id") DO UPDATE
SET "deleted_at" = NULL;
-- +goose StatementEnd

-- +goose StatementBegin
-- The platform identity is permanent: every platform credential resolves
-- through this row, and GetActiveTokenByLookupHash filters u.deleted_at IS NULL,
-- so one DELETE /users/{id} would silently kill all of them. Soft delete is the
-- only path the API has (DeleteUser is SET deleted_at = now()), so a BEFORE
-- UPDATE trigger is the complete guard; the hard delete is already blocked by
-- user_on_organization_user_id_fkey being ON DELETE RESTRICT.
CREATE FUNCTION protect_kaiten_system_user()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."external_id" = 'system:kaiten'
     AND NEW."deleted_at" IS NOT NULL
     AND OLD."deleted_at" IS NULL THEN
    RAISE EXCEPTION 'the system:kaiten platform identity cannot be deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_protect_kaiten_system_user ON "user";
CREATE TRIGGER trg_protect_kaiten_system_user
BEFORE UPDATE ON "user"
FOR EACH ROW
EXECUTE FUNCTION protect_kaiten_system_user();

-- +goose StatementBegin
-- Same for the memberships. Deleting an organization removes its membership
-- through user_on_organization_organization_id_fkey's ON DELETE CASCADE -- a
-- hard DELETE, which this UPDATE trigger does not see, so that one permitted
-- path stays open and the seeder's org cleanup keeps working.
CREATE FUNCTION protect_kaiten_system_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."deleted_at" IS NOT NULL
     AND OLD."deleted_at" IS NULL
     AND EXISTS (SELECT 1 FROM "user"
                 WHERE "id" = OLD."user_id" AND "external_id" = 'system:kaiten') THEN
    RAISE EXCEPTION 'the system:kaiten membership cannot be removed; delete the organization instead'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS trg_protect_kaiten_system_membership ON "user_on_organization";
CREATE TRIGGER trg_protect_kaiten_system_membership
BEFORE UPDATE ON "user_on_organization"
FOR EACH ROW
EXECUTE FUNCTION protect_kaiten_system_membership();

-- +goose StatementBegin
-- Token kinds. A new enum type rather than ALTER TYPE ... ADD VALUE, which
-- cannot run inside goose's transaction.
CREATE TYPE "token_kind" AS ENUM ('organization', 'platform');

-- Existing rows are all organization tokens, so the default makes this a pure
-- metadata change: no data migration touches a single row.
ALTER TABLE "token" ADD COLUMN "kind" "token_kind" NOT NULL DEFAULT 'organization';
ALTER TABLE "token" ALTER COLUMN "organization_id" DROP NOT NULL;

-- Revoking a compromised platform token has to take everything it issued with
-- it. SET NULL because tokens are retired by revocation, not deletion.
ALTER TABLE "token" ADD COLUMN "issued_by_platform_token_id" UUID
  REFERENCES "token" ("id") ON DELETE SET NULL;

-- Orgless is a privileged, checked state -- not a consequence of a nullable
-- column. A regular user or a tenant service account can never reach it. The
-- literal uuid is the row pinned above; "owner is system:kaiten" cannot be a
-- subquery in a CHECK.
ALTER TABLE "token" ADD CONSTRAINT "token_platform_is_orgless_system" CHECK (
  ("kind" = 'organization' AND "organization_id" IS NOT NULL)
  OR ("kind" = 'platform'
      AND "organization_id" IS NULL
      AND "service_account_id" = '00000000-0000-0000-0000-000000000001'::uuid));

-- A platform token cannot be minted by another platform token: admin-tools is
-- the only issuer.
ALTER TABLE "token" ADD CONSTRAINT "token_platform_has_no_parent" CHECK (
  "kind" = 'organization' OR "issued_by_platform_token_id" IS NULL);

-- token_slug (slug, organization_id) and token_name (service_account_id, name,
-- organization_id) both stop enforcing anything once organization_id is NULL.
-- These are what keep platform token names unique -- and what makes two
-- concurrent bootstrap Jobs resolve deterministically at the database instead of
-- through a check-then-act race in the CLI.
CREATE UNIQUE INDEX "uq_token_platform_name_active"
  ON "token" ("name")
  WHERE "kind" = 'platform' AND "revoked_date" IS NULL;

CREATE UNIQUE INDEX "uq_token_platform_slug"
  ON "token" ("slug")
  WHERE "kind" = 'platform';

-- The platform equivalent of idx_token_lookup_hash_active. organization_id is
-- deliberately absent from INCLUDE: it is always NULL on these rows, and no
-- query on this path may select it.
CREATE UNIQUE INDEX "idx_token_platform_lookup_hash_active"
  ON "token" ("lookup_hash")
  INCLUDE ("hash", "service_account_id", "scopes", "expires_at")
  WHERE "kind" = 'platform' AND "revoked_date" IS NULL;

CREATE INDEX "idx_token_issued_by_platform_active"
  ON "token" ("issued_by_platform_token_id")
  WHERE "revoked_date" IS NULL;

-- token_name spanned revoked rows, so revoking a token never released its name
-- and the name it held could never be reused. That makes
-- rotation-by-replacement -- revoke the active credential called X, mint a fresh
-- one called X -- impossible, which is what `service-token mint --replace` and a
-- re-runnable `task up` both need. uq_token_platform_name_active already gives
-- platform rows the semantics this restores for organization rows: a name
-- identifies an *active* credential, and a retired row keeps its name only as
-- audit evidence.
--
-- Recreated under the SAME identifier, as an index rather than a constraint:
-- every apierrors.IsUniqueViolationOnConstraint(err, "token_name") mapping keeps
-- working, because Postgres reports the index name either way.
ALTER TABLE "token" DROP CONSTRAINT "token_name";
CREATE UNIQUE INDEX "token_name"
  ON "token" ("service_account_id", "name", "organization_id")
  WHERE "revoked_date" IS NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Back to a constraint spanning every row, revoked ones included. Two rows that
-- only coexist because one is revoked would violate it, so the revoked one goes
-- first: down-to must land on the old schema, and there is nowhere else to put a
-- retired duplicate.
DROP INDEX IF EXISTS "token_name";
DELETE FROM "token" t
WHERE t."revoked_date" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "token" o
              WHERE o."id" <> t."id"
                AND o."service_account_id" = t."service_account_id"
                AND o."name" = t."name"
                AND o."organization_id" IS NOT DISTINCT FROM t."organization_id");
ALTER TABLE "token" ADD CONSTRAINT "token_name"
  UNIQUE ("service_account_id", "name", "organization_id");

DROP INDEX IF EXISTS "idx_token_issued_by_platform_active";
DROP INDEX IF EXISTS "idx_token_platform_lookup_hash_active";
DROP INDEX IF EXISTS "uq_token_platform_slug";
DROP INDEX IF EXISTS "uq_token_platform_name_active";

ALTER TABLE "token" DROP CONSTRAINT "token_platform_has_no_parent";
ALTER TABLE "token" DROP CONSTRAINT "token_platform_is_orgless_system";

-- Platform tokens are the only rows with a NULL organization_id, and there is
-- nowhere to put them once the column is NOT NULL again. They are credentials,
-- not records: recreate them with `kaiten-admin-tools platform-token create`.
DELETE FROM "token" WHERE "kind" = 'platform';

ALTER TABLE "token" DROP COLUMN "issued_by_platform_token_id";
ALTER TABLE "token" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "token" DROP COLUMN "kind";
DROP TYPE "token_kind";

DROP TRIGGER IF EXISTS trg_protect_kaiten_system_membership ON "user_on_organization";
DROP FUNCTION IF EXISTS protect_kaiten_system_membership();
DROP TRIGGER IF EXISTS trg_protect_kaiten_system_user ON "user";
DROP FUNCTION IF EXISTS protect_kaiten_system_user();
-- +goose StatementEnd

-- +goose StatementBegin
-- Restores the trigger body exactly as 20260810000000 wrote it, bug included:
-- down-to means "the database as it was", not "as it should have been".
CREATE OR REPLACE FUNCTION ensure_kaiten_system_user_membership_for_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" <> '00000000-0000-0000-0000-000000000001'::uuid
     AND EXISTS (
    SELECT 1
    FROM "user"
    WHERE "id" = '00000000-0000-0000-0000-000000000001'::uuid
      AND "external_id" = 'system:kaiten'
  ) THEN
    INSERT INTO "user_on_organization" ("organization_id", "user_id", "deleted_at")
    VALUES (NEW."id", '00000000-0000-0000-0000-000000000001'::uuid, NULL)
    ON CONFLICT ("organization_id", "user_id") DO UPDATE
    SET "deleted_at" = NULL;
  END IF;

  RETURN NEW;
END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
-- The row goes back to being a human with no slug, which is the only shape the
-- restored constraints below accept. Its memberships stay: they are real, and
-- the pre-existing schema has nothing against them.
UPDATE "user"
SET "type" = 'human', "slug" = NULL
WHERE "external_id" = 'system:kaiten';

DROP INDEX IF EXISTS "idx_unique_orgless_machine_slug";

COMMENT ON COLUMN "user"."organization_id" IS
  'Machine accounts only (see user_organization_id_machine_check). Not read by any application query - membership is resolved via user_on_organization. Kept because idx_unique_machine_slug_per_org depends on it for per-organization slug uniqueness.';

ALTER TABLE "user" DROP CONSTRAINT "user_email_machine_check";
ALTER TABLE "user" ADD CONSTRAINT "user_email_machine_check" CHECK (
  "type" != 'machine' OR "email" IS NULL);

ALTER TABLE "user" DROP CONSTRAINT "user_organization_id_machine_check";
ALTER TABLE "user" ADD CONSTRAINT "user_organization_id_machine_check" CHECK (
  "type" != 'machine' OR "organization_id" IS NOT NULL);
-- +goose StatementEnd
