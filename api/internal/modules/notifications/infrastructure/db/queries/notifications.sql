-- name: ListNotifications :many
-- The feed: one organization's notifiable audit trail rows, newest first, with
-- this user's read state resolved.
--
-- Read is two things ORed: an individual mark (notification_read) or the "mark
-- all read" watermark. Keeping both is what lets "mark all read" be one UPDATE
-- instead of one row per notification.
--
-- Cursor (keyset) pagination on (occurred_at, id) -- id tie-breaks, since
-- occurred_at is not unique. Pass limit_plus_one = requested limit + 1 to learn
-- whether a further page exists without a second query. On the first page, pass
-- NULL for both cursor columns.
--
-- unread_only is applied here rather than by the caller because the predicate it
-- needs (the watermark join) only exists inside this query.
SELECT
  at.id,
  at.event_name,
  at.event_type,
  at.occurred_at,
  at.payload,
  at.instance_id,
  (r.user_id IS NOT NULL OR at.occurred_at <= s.read_all_before) AS read
FROM audit_trail at
LEFT JOIN notification_read r
  ON r.audit_trail_id = at.id AND r.user_id = sqlc.arg(user_id)
CROSS JOIN LATERAL (
  SELECT COALESCE(
    (SELECT us.read_all_before FROM notification_user_state us WHERE us.user_id = sqlc.arg(user_id)),
    '-infinity'::timestamptz
  ) AS read_all_before
) s
WHERE at.organization_id = sqlc.arg(organization_id)
  AND at.event_name = ANY(sqlc.arg(event_names)::text[])
  AND at.occurred_at >= sqlc.arg(window_start)
  AND (
    sqlc.narg(cursor_occurred_at)::timestamptz IS NULL
    OR (at.occurred_at, at.id) < (sqlc.narg(cursor_occurred_at)::timestamptz, sqlc.narg(cursor_id)::uuid)
  )
  AND (
    NOT sqlc.arg(unread_only)::boolean
    OR (r.user_id IS NULL AND at.occurred_at > s.read_all_before)
  )
ORDER BY at.occurred_at DESC, at.id DESC
LIMIT sqlc.arg(limit_plus_one);

-- name: CountUnreadNotifications :one
-- Capped deliberately: the badge shows "99+" past a point, so counting further
-- buys nothing and an organization with a large backlog should not pay for it.
-- The cap is the caller's, passed as max_count.
SELECT count(*) AS unread_count
FROM (
  SELECT 1
  FROM audit_trail at
  LEFT JOIN notification_read r
    ON r.audit_trail_id = at.id AND r.user_id = sqlc.arg(user_id)
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (SELECT us.read_all_before FROM notification_user_state us WHERE us.user_id = sqlc.arg(user_id)),
      '-infinity'::timestamptz
    ) AS read_all_before
  ) s
  WHERE at.organization_id = sqlc.arg(organization_id)
    AND at.event_name = ANY(sqlc.arg(event_names)::text[])
    AND at.occurred_at >= sqlc.arg(window_start)
    AND r.user_id IS NULL
    AND at.occurred_at > s.read_all_before
  LIMIT sqlc.arg(max_count)
) capped;

-- name: GetNotification :one
-- One row, for the frame pushed down an open stream. Scoped by organization for
-- the same reason the feed is: the id arrives over a NOTIFY channel every replica
-- listens on, so the query is what proves it belongs to this reader.
SELECT
  at.id,
  at.event_name,
  at.event_type,
  at.occurred_at,
  at.payload,
  at.instance_id
FROM audit_trail at
WHERE at.id = sqlc.arg(id)
  AND at.organization_id = sqlc.arg(organization_id);

-- name: MarkNotificationsRead :execrows
-- The join against audit_trail is the authorization: an id from another
-- organization matches nothing and marks nothing, rather than erroring, which is
-- also what makes the call idempotent for a client retrying a partial page.
INSERT INTO notification_read (user_id, audit_trail_id)
SELECT sqlc.arg(user_id), at.id
FROM audit_trail at
WHERE at.id = ANY(sqlc.arg(ids)::uuid[])
  AND at.organization_id = sqlc.arg(organization_id)
ON CONFLICT DO NOTHING;

-- name: MarkAllNotificationsRead :exec
-- Moves the watermark instead of writing a row per notification.
INSERT INTO notification_user_state (user_id, read_all_before)
VALUES (sqlc.arg(user_id), sqlc.arg(read_all_before))
ON CONFLICT (user_id) DO UPDATE
  SET read_all_before = GREATEST(notification_user_state.read_all_before, EXCLUDED.read_all_before);

-- name: CompactNotificationReads :exec
-- Deletes the individual marks the watermark now covers. This is what bounds
-- notification_read: without it the table would keep every row a user ever
-- clicked, all of them redundant.
DELETE FROM notification_read r
USING audit_trail at
WHERE r.audit_trail_id = at.id
  AND r.user_id = sqlc.arg(user_id)
  AND at.occurred_at <= sqlc.arg(read_all_before);

-- name: ListNotificationPreferences :many
-- Overrides only. Absent rows mean the catalogue default, which is resolved in
-- Go rather than here so that changing a default never needs a data migration.
SELECT event_name, channel, enabled
FROM notification_preference
WHERE user_id = sqlc.arg(user_id);

-- name: UpsertNotificationPreference :exec
INSERT INTO notification_preference (user_id, event_name, channel, enabled)
VALUES (sqlc.arg(user_id), sqlc.arg(event_name), sqlc.arg(channel), sqlc.arg(enabled))
ON CONFLICT (user_id, event_name, channel) DO UPDATE
  SET enabled = EXCLUDED.enabled;

-- name: DeleteNotificationPreferences :exec
-- Used when a PUT restates the catalogue default for an event: storing "the
-- default, again" would freeze today's default into the user's row and make a
-- later change to it invisible to everyone who ever opened the page.
DELETE FROM notification_preference
WHERE user_id = sqlc.arg(user_id)
  AND event_name = ANY(sqlc.arg(event_names)::text[])
  AND channel = sqlc.arg(channel);

-- name: ResolveInstances :many
-- The objects a page of notifications names, looked up once per page rather than
-- once per row. Resolved at read time for the same reason titles are rendered
-- then: a payload is whatever its producer wrote, some events carry nothing but
-- ids, and a link has to use the slug an object has now, not the one it had.
-- Scoped by organization like every read here: the ids come from rows this reader
-- may see, but the scope is what proves it.
SELECT id, slug, name
FROM instance
WHERE organization_id = sqlc.arg(organization_id)
  AND id = ANY(sqlc.arg(ids)::uuid[]);

-- name: ResolveDeploymentZones :many
SELECT id, slug, name
FROM deployment_zone
WHERE organization_id = sqlc.arg(organization_id)
  AND id = ANY(sqlc.arg(ids)::uuid[]);

-- name: ResolveReleases :many
SELECT id, slug, version
FROM release
WHERE organization_id = sqlc.arg(organization_id)
  AND id = ANY(sqlc.arg(ids)::uuid[]);

-- name: ResolveLicenses :many
SELECT id, slug, name
FROM license
WHERE organization_id = sqlc.arg(organization_id)
  AND id = ANY(sqlc.arg(ids)::uuid[]);
