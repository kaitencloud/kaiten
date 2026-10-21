-- +goose Up
-- +goose StatementBegin
-- The self-serve additions of v3.2: the anonymous checkout (V32-01), the
-- billing-period windows after a cancellation (V32-04), the checkout that waits
-- on a free subscription (lead's ruling on V31-68) and the trial reminder lead
-- (V32-07). Every new column is nullable or has a DEFAULT; nothing is seeded,
-- and the backfills read existing rows only.

-- Tier 2 on the publishable key. anonymous_checkout opts the key in (403
-- CreateCheckoutSession.AnonymousCheckoutDisabled while false).
-- turnstile_site_key is public: the catalogue hands it to the page that
-- renders the widget. The Turnstile secret is never in the database: it lives
-- in Vault like the connector settings, and turnstile_secret_set_at records
-- that one is set, so reads expose turnstileSecretConfigured with no Vault
-- call. The (id, organization_id) key is the target of checkout_session's
-- composite foreign key.
ALTER TABLE "publishable_key"
  ADD COLUMN "anonymous_checkout" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "turnstile_site_key" TEXT,
  ADD COLUMN "turnstile_secret_set_at" TIMESTAMP(3);
ALTER TABLE "publishable_key"
  ADD CONSTRAINT "publishable_key_id_organization_id_key" UNIQUE ("id", "organization_id"),
  ADD CONSTRAINT "publishable_key_turnstile_site_key_check" CHECK (
    "turnstile_site_key" IS NULL OR "turnstile_site_key" ~ '^[A-Za-z0-9_-]{1,255}$'
    );

-- One row per anonymous checkout (V32-01): the only row a checkout writes
-- before its confirm or its payment-method setup (INV-34), the holder of its
-- ksc_ digest (INV-36), and the link between the buyer and what the
-- completion creates. No author column: no principal of the vendor initiates a
-- Tier 2 write.
--
-- lookup_hash: hex(SHA-256) of the ksc_ token, as for pk_ and kst_.
-- email: stored as given; it becomes customer.billing_email only in the
-- completion's transaction, keys the one-trial-per-e-mail check in its
-- lower-cased form (INV-35), and travels in the checkout_session events.
-- license_price_id: the price chosen at the start. CASCADE: an OPEN session
-- whose version is deleted goes with it; a provisioned one is protected by its
-- subscription's RESTRICT.
-- selection: camelCase {addOns: [{addonId, quantity}], voucher: {voucherId,
-- code} | null}, what the start priced; no FK, the completion re-validates it.
-- due_today_minor / currency: the dueToday the start answered.
-- external_setup_session_id / setup_completed_at: the provider's hosted setup
-- session, and the instant it was reported complete, written in its own short
-- transaction before the completion's; OPEN with setup_completed_at set is a
-- completion still to run.
-- customer_id / instance_id: what the completion created. CASCADE: the
-- session, and the e-mail it holds, go with them (INV-29).
-- closed_at: the instant the session reached COMPLETED, ABANDONED or EXPIRED;
-- it starts the 24 h read of the ksc_ and the 90-day retention of
-- billing-lifecycle step (h).
CREATE TABLE "checkout_session"
(
  "id"                        UUID                      NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"           UUID                      NOT NULL,
  "publishable_key_id"        UUID                      NOT NULL,
  "lookup_hash"               TEXT                      NOT NULL,
  "status"                    "checkout_session_status" NOT NULL DEFAULT 'OPEN',
  "email"                     TEXT                      NOT NULL,
  "client_reference_id"       TEXT,
  "license_price_id"          UUID                      NOT NULL,
  "selection"                 JSONB                     NOT NULL DEFAULT '{}'::jsonb,
  "due_today_minor"           BIGINT                    NOT NULL,
  "currency"                  CHAR(3)                   NOT NULL,
  "trial_refused_reason"      TEXT,
  "return_url"                TEXT                      NOT NULL,
  "external_setup_session_id" TEXT,
  "setup_completed_at"        TIMESTAMP(3),
  "customer_id"               UUID,
  "instance_id"               UUID,
  "created_at"                TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at"                TIMESTAMP(3)              NOT NULL,
  "completed_at"              TIMESTAMP(3),
  "abandoned_at"              TIMESTAMP(3),
  "expired_at"                TIMESTAMP(3),
  "closed_at"                 TIMESTAMP(3),
  "updated_at"                TIMESTAMP(3)              NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "checkout_session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "checkout_session_organization_id_fkey" FOREIGN KEY ("organization_id")
    REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "checkout_session_publishable_key_id_fkey" FOREIGN KEY ("publishable_key_id", "organization_id")
    REFERENCES "publishable_key" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "checkout_session_license_price_id_fkey" FOREIGN KEY ("license_price_id", "organization_id")
    REFERENCES "license_price" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "checkout_session_customer_id_fkey" FOREIGN KEY ("customer_id", "organization_id")
    REFERENCES "customer" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "checkout_session_instance_id_fkey" FOREIGN KEY ("instance_id", "organization_id")
    REFERENCES "instance" ("id", "organization_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "checkout_session_lookup_hash_check" CHECK ("lookup_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "checkout_session_email_check" CHECK (
    "email" ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length("email") <= 254
    ),
  CONSTRAINT "checkout_session_client_reference_id_check" CHECK (
    "client_reference_id" IS NULL OR char_length("client_reference_id") BETWEEN 1 AND 255
    ),
  CONSTRAINT "checkout_session_selection_check" CHECK (jsonb_typeof("selection") = 'object'),
  CONSTRAINT "checkout_session_due_today_check" CHECK ("due_today_minor" >= 0 AND "currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "checkout_session_trial_refused_reason_check" CHECK (
    "trial_refused_reason" IS NULL OR "trial_refused_reason" = 'ALREADY_CONSUMED'
    ),
  CONSTRAINT "checkout_session_return_url_check" CHECK (
    "return_url" ~ '^https?://\S+$' AND char_length("return_url") <= 2048
    ),
  -- Nothing but the session before the confirm or the setup (INV-34): OPEN and
  -- ABANDONED name no customer; every later status names both.
  CONSTRAINT "checkout_session_provisioned_check" CHECK (
    ("status" IN ('OPEN', 'ABANDONED')) = ("customer_id" IS NULL)
      AND ("customer_id" IS NULL) = ("instance_id" IS NULL)
    ),
  CONSTRAINT "checkout_session_expires_at_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "checkout_session_status_check" CHECK (
    ("status" = 'COMPLETED') = ("completed_at" IS NOT NULL)
      AND ("status" = 'ABANDONED') = ("abandoned_at" IS NOT NULL)
      AND ("status" = 'EXPIRED') = ("expired_at" IS NOT NULL)
    ),
  CONSTRAINT "checkout_session_closed_at_check" CHECK (
    ("closed_at" IS NULL) = ("status" IN ('OPEN', 'AWAITING_PAYMENT'))
      AND "closed_at" IS NOT DISTINCT FROM COALESCE("completed_at", "abandoned_at", "expired_at")
    )
);

-- The ksc_ lookup, answered from the index; the lifetime of INV-36 is applied
-- on the row.
CREATE UNIQUE INDEX "idx_checkout_session_lookup_hash"
  ON "checkout_session" ("lookup_hash") INCLUDE ("organization_id", "status");
-- billing-lifecycle step (f): the sessions still OPEN at expires_at.
CREATE INDEX "idx_checkout_session_open_expires_at"
  ON "checkout_session" ("expires_at")
  WHERE "status" = 'OPEN';
-- The sync backstop: setups reported complete whose completion has not run.
CREATE INDEX "idx_checkout_session_setup_completed"
  ON "checkout_session" ("setup_completed_at")
  WHERE "status" = 'OPEN' AND "setup_completed_at" IS NOT NULL;
-- The vendor's list (GET /checkout-sessions), paged on (created_at, id), and
-- the organization CASCADE; its two filters.
CREATE INDEX "idx_checkout_session_organization_created_at"
  ON "checkout_session" ("organization_id", "created_at" DESC, "id" DESC);
CREATE INDEX "idx_checkout_session_organization_email"
  ON "checkout_session" ("organization_id", lower("email"));
CREATE INDEX "idx_checkout_session_organization_client_reference"
  ON "checkout_session" ("organization_id", "client_reference_id")
  WHERE "client_reference_id" IS NOT NULL;
-- The CASCADEs from customer and instance, and the lookup of an instance's
-- session when its INCOMPLETE subscription is paid, expires or is canceled.
CREATE INDEX "idx_checkout_session_customer"
  ON "checkout_session" ("customer_id")
  WHERE "customer_id" IS NOT NULL;
CREATE INDEX "idx_checkout_session_instance"
  ON "checkout_session" ("instance_id")
  WHERE "instance_id" IS NOT NULL;
-- billing-lifecycle step (h): closed sessions past their retention.
CREATE INDEX "idx_checkout_session_closed_at"
  ON "checkout_session" ("closed_at")
  WHERE "closed_at" IS NOT NULL;

-- One trial per e-mail and family (INV-35): a Tier 2 checkout reads the
-- trials of every customer of the organization whose lower-cased billing_email
-- is the session's e-mail. Not unique: several customers may share an e-mail.
CREATE INDEX "idx_customer_billing_email_normalized"
  ON "customer" ("organization_id", lower("billing_email"))
  WHERE "billing_email" IS NOT NULL;

-- The trial reminder lead of a family (V32-07): trial_will_end fires
-- trial_reminder_days before trial_ends_at, read when a trial starts.
ALTER TABLE "license_family"
  ADD COLUMN "trial_reminder_days" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "license_family"
  ADD CONSTRAINT "license_family_trial_reminder_days_check" CHECK ("trial_reminder_days" BETWEEN 1 AND 30);

-- live_ended_at: the instant the last TRIAL, ACTIVE or PAST_DUE subscription
-- of the row became CANCELED (V32-04). Every such cancellation sets it to its
-- canceled_at; the expiry and the cancel of an INCOMPLETE subscription never
-- write it, and nothing clears it. It splits the LICENSE_START window of
-- BILLING_PERIOD entitlements after a cancellation, which canceled_at cannot
-- do. Backfilled from canceled_at on CANCELED rows.
--
-- trial_will_end_at: when the trial_will_end event is due (V32-07), set when a
-- trial starts to trial_ends_at minus the family's trial_reminder_days, so a
-- later change to the family moves no running trial; NULL outside TRIAL.
-- Backfilled on TRIAL rows from their family (3 days, the DEFAULT).
ALTER TABLE "instance_billing"
  ADD COLUMN "live_ended_at" TIMESTAMP(3),
  ADD COLUMN "trial_will_end_at" TIMESTAMP(3);
UPDATE "instance_billing"
SET "live_ended_at" = "canceled_at"
WHERE "status" = 'CANCELED';
UPDATE "instance_billing" ib
SET "trial_will_end_at" = ib."trial_ends_at" - make_interval(days => lf."trial_reminder_days")
FROM "license_price" lp
JOIN "license" l
  ON l."id" = lp."license_id"
 AND l."organization_id" = lp."organization_id"
JOIN "license_family" lf
  ON lf."id" = l."family_id"
 AND lf."organization_id" = l."organization_id"
WHERE ib."status" = 'TRIAL'
  AND lp."id" = ib."base_license_price_id"
  AND lp."organization_id" = ib."organization_id";
ALTER TABLE "instance_billing"
  ADD CONSTRAINT "instance_billing_trial_will_end_at_check" CHECK ("trial_will_end_at" IS NULL OR "status" = 'TRIAL');

-- A checkout waiting on a free subscription (lead's ruling on V31-68): with an
-- amount due today the free subscription stays live until the ACTIVATION is
-- PAID, so the pending columns sit on a TRIAL, ACTIVE or PAST_DUE row. The
-- three columns are all set or all NULL; INCOMPLETE requires them; a row
-- holding them is live; pending_selection is a JSON object and, on a row that
-- is not INCOMPLETE, names licensePriceId, the price the payment makes the
-- base (an INCOMPLETE row's is already base_license_price_id). Step (d) of
-- billing-lifecycle expires both kinds, hence the index predicate.
ALTER TABLE "instance_billing" DROP CONSTRAINT "instance_billing_incomplete_check";
ALTER TABLE "instance_billing"
  ADD CONSTRAINT "instance_billing_incomplete_check" CHECK (
    ("pending_license_id" IS NULL) = ("pending_selection" IS NULL)
      AND ("pending_license_id" IS NULL) = ("incomplete_expires_at" IS NULL)
      AND ("status" <> 'INCOMPLETE' OR "pending_license_id" IS NOT NULL)
      AND ("pending_license_id" IS NULL OR "status" <> 'CANCELED')
      AND ("pending_selection" IS NULL OR jsonb_typeof("pending_selection") = 'object')
      AND ("pending_selection" IS NULL OR "status" = 'INCOMPLETE' OR "pending_selection" ? 'licensePriceId')
    );
DROP INDEX "idx_instance_billing_incomplete_expires_at";
CREATE INDEX "idx_instance_billing_incomplete_expires_at"
  ON "instance_billing" ("incomplete_expires_at")
  WHERE "incomplete_expires_at" IS NOT NULL;
-- last_successful_sync_at: the end of the last provider sync pass whose status
-- was SUCCESS, kept beside the last pass of any status (V31-11, §19.3
-- providerSync.lastSuccessfulSyncAt). Not in the DDL pack: the test plan
-- leaves its storage to the implementation (G-S18-13). Backfilled from the
-- passes that succeeded.
ALTER TABLE "billing_sync_state"
  ADD COLUMN "last_successful_sync_at" TIMESTAMP(3);
UPDATE "billing_sync_state"
SET "last_successful_sync_at" = "last_synced_at"
WHERE "last_sync_status" = 'SUCCESS';
ALTER TABLE "billing_sync_state"
  ADD CONSTRAINT "billing_sync_state_last_successful_sync_at_check" CHECK (
    "last_sync_status" IS DISTINCT FROM 'SUCCESS' OR "last_successful_sync_at" = "last_synced_at"
    );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- An open checkout would lose its session, and a checkout waiting on a free
-- subscription cannot be represented by the M19 constraint: the Down refuses
-- both.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "checkout_session" WHERE "status" IN ('OPEN', 'AWAITING_PAYMENT')) THEN
    RAISE EXCEPTION 'checkout_session has OPEN or AWAITING_PAYMENT rows; let them close before rolling back 20261021010000';
  END IF;
  IF EXISTS (SELECT 1 FROM "instance_billing" WHERE "pending_license_id" IS NOT NULL AND "status" <> 'INCOMPLETE') THEN
    RAISE EXCEPTION 'instance_billing has checkouts waiting on a free subscription; let them expire before rolling back 20261021010000';
  END IF;
END $$;

ALTER TABLE "billing_sync_state" DROP CONSTRAINT IF EXISTS "billing_sync_state_last_successful_sync_at_check";
ALTER TABLE "billing_sync_state" DROP COLUMN IF EXISTS "last_successful_sync_at";

-- Back to the constraint and index of 20261017020000, verbatim.
DROP INDEX IF EXISTS "idx_instance_billing_incomplete_expires_at";
CREATE INDEX "idx_instance_billing_incomplete_expires_at"
  ON "instance_billing" ("incomplete_expires_at")
  WHERE "status" = 'INCOMPLETE';
ALTER TABLE "instance_billing" DROP CONSTRAINT IF EXISTS "instance_billing_incomplete_check";
ALTER TABLE "instance_billing"
  ADD CONSTRAINT "instance_billing_incomplete_check" CHECK (
    ("status" = 'INCOMPLETE') = ("pending_license_id" IS NOT NULL)
      AND ("status" = 'INCOMPLETE') = ("pending_selection" IS NOT NULL)
      AND ("status" = 'INCOMPLETE') = ("incomplete_expires_at" IS NOT NULL)
      AND ("pending_selection" IS NULL OR jsonb_typeof("pending_selection") = 'object')
    );

ALTER TABLE "instance_billing" DROP CONSTRAINT IF EXISTS "instance_billing_trial_will_end_at_check";
ALTER TABLE "instance_billing"
  DROP COLUMN IF EXISTS "trial_will_end_at",
  DROP COLUMN IF EXISTS "live_ended_at";

ALTER TABLE "license_family" DROP CONSTRAINT IF EXISTS "license_family_trial_reminder_days_check";
ALTER TABLE "license_family" DROP COLUMN IF EXISTS "trial_reminder_days";

DROP INDEX IF EXISTS "idx_customer_billing_email_normalized";

DROP TABLE IF EXISTS "checkout_session";

ALTER TABLE "publishable_key" DROP CONSTRAINT IF EXISTS "publishable_key_turnstile_site_key_check";
ALTER TABLE "publishable_key" DROP CONSTRAINT IF EXISTS "publishable_key_id_organization_id_key";
ALTER TABLE "publishable_key"
  DROP COLUMN IF EXISTS "turnstile_secret_set_at",
  DROP COLUMN IF EXISTS "turnstile_site_key",
  DROP COLUMN IF EXISTS "anonymous_checkout";
-- +goose StatementEnd
