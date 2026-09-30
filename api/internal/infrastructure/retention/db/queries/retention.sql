-- Every purge deletes one bounded batch, oldest first, so a table that has
-- accumulated for months is drained over many short transactions instead of
-- one long one holding locks and bloating WAL. Equal timestamps are ordered
-- by id to make progress deterministic. SKIP LOCKED avoids waiting behind an
-- unrelated transaction touching an expired row.

-- name: PurgeOutboxEvents :execrows
WITH expired AS (
  SELECT oe.id
  FROM outbox_events oe
  WHERE oe.occurred_at < sqlc.arg(cutoff)
  ORDER BY oe.occurred_at, oe.id
  LIMIT sqlc.arg(batch_size)
  FOR UPDATE SKIP LOCKED
)
DELETE FROM outbox_events oe
USING expired
WHERE oe.id = expired.id;

-- name: PurgeInboxEvents :execrows
WITH expired AS (
  SELECT ie.id
  FROM inbox_events ie
  WHERE ie.processed_at < sqlc.arg(cutoff)
  ORDER BY ie.processed_at, ie.id
  LIMIT sqlc.arg(batch_size)
  FOR UPDATE SKIP LOCKED
)
DELETE FROM inbox_events ie
USING expired
WHERE ie.id = expired.id;

-- The cross-replica election is not here: internal/infrastructure/sweep owns it,
-- because it is identical for every maintenance pass and there is now more than
-- one.
