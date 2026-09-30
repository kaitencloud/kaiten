-- +goose Up
-- +goose StatementBegin
-- Two facts about a connector that the schema could not tell apart until now.
--
-- REGISTRATION is deployment-wide and already had a home: `connector`, one row per
-- name, no organization column. It means "this deployment knows this connector
-- exists".
--
-- ACTIVATION is per organization and had none. "This organization uses Attio" was
-- inferred from a Vault secret existing at
-- kaiten/connectors/{org}/{connector}/settings, which the frontend read as a 404 on
-- GET /connectors/{name}/settings. That made three different questions -- is the
-- connector available, is this organization allowed it, has it turned it on -- share
-- one status code, and left activation state in a store Postgres cannot join
-- against, cannot cascade on organization delete, and cannot report on.
--
-- organization_connector is that missing fact, and only that fact. The settings
-- payload stays where it is: secrets belong in a secret store, and the point of
-- separating them is that a row here answers "activated?" without anybody having to
-- read a credential to find out.
CREATE TABLE "organization_connector"
(
  "organization_id" UUID        NOT NULL,
  "connector_name"  TEXT        NOT NULL,
  "activated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "organization_connector_pkey" PRIMARY KEY ("organization_id", "connector_name"),
  -- Activation cannot outlive the tenant, and cannot outlive the registration it
  -- depends on: settings for a connector this deployment no longer knows about are
  -- already refused, so an activation row for one would describe nothing.
  CONSTRAINT "organization_connector_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "organization_connector_connector_name_fkey" FOREIGN KEY ("connector_name")
    REFERENCES "connector" ("name") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The catalogue lists connectors from every source, and not every deployment sells
-- the same ones -- so which entitlement gates a connector is declared BY the
-- connector when it registers, not mapped by Kaiten.
--
-- NULL means ungated, and it is the right default in both directions: a self-hosted
-- deployment has no licensing authority to ask, and a connector registered before
-- anyone decided to charge for it keeps working.
ALTER TABLE "connector" ADD COLUMN "entitlement_slug" TEXT;

COMMENT ON COLUMN "connector"."entitlement_slug" IS
  'Slug of the BOOLEAN entitlement an organization''s license must grant before it may activate this connector. NULL means ungated.';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "organization_connector";
ALTER TABLE "connector" DROP COLUMN IF EXISTS "entitlement_slug";
-- +goose StatementEnd
