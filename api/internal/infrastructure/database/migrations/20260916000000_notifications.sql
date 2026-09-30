-- +goose Up
-- +goose StatementBegin
-- There is no notification table, deliberately: a notification is an audit_trail
-- row seen by a user, and the audit trail already stores every event once, per
-- organization. What is per-user is read state and subscription, and that is all
-- these tables hold.

-- Sparse: a row exists only for a notification this user read individually. "Mark
-- all read" moves the watermark below instead of writing one row per notification,
-- and deletes the rows it makes redundant -- which is what bounds this table.
CREATE TABLE "notification_read"
(
  "user_id"        UUID        NOT NULL,
  "audit_trail_id" UUID        NOT NULL,
  "read_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "notification_read_pkey" PRIMARY KEY ("user_id", "audit_trail_id"),
  CONSTRAINT "notification_read_user_id_fkey"        FOREIGN KEY ("user_id")        REFERENCES "user" ("id")        ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notification_read_audit_trail_id_fkey" FOREIGN KEY ("audit_trail_id") REFERENCES "audit_trail" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One row per user. read_all_before is the "mark all read" watermark: everything
-- that happened at or before it is read, whatever notification_read says.
CREATE TABLE "notification_user_state"
(
  "user_id"         UUID        NOT NULL,
  "read_all_before" TIMESTAMPTZ NOT NULL DEFAULT '-infinity',

  CONSTRAINT "notification_user_state_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "notification_user_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Sparse overrides. No row means "whatever the catalogue entry defaults to", so a
-- new notifiable event ships without touching anybody's stored preferences.
--
-- channel exists from day one even though in_app is the only one served: adding
-- email or an IM channel should be a catalogue entry and a sender, not a migration
-- of the preference model.
CREATE TABLE "notification_preference"
(
  "user_id"    UUID    NOT NULL,
  "event_name" TEXT    NOT NULL,
  "channel"    TEXT    NOT NULL,
  "enabled"    BOOLEAN NOT NULL,

  CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("user_id", "event_name", "channel"),
  CONSTRAINT "notification_preference_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- The feed's access path: one organization's notifiable events, newest first. The
-- existing indexes are (organization_id, instance_id) and (occurred_at DESC);
-- neither serves this, and audit_trail also holds very high-volume rows (every
-- ENTITLEMENT_VALUE_GET) that the event_name column is what filters out.
CREATE INDEX "idx_audit_trail_feed" ON "audit_trail" ("organization_id", "event_name", "occurred_at" DESC, "id");

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS "idx_audit_trail_feed";
DROP TABLE IF EXISTS "notification_preference";
DROP TABLE IF EXISTS "notification_user_state";
DROP TABLE IF EXISTS "notification_read";
-- +goose StatementEnd
