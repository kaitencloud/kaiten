-- name: AuthenticateCheckoutSession :one
-- A ksc_ by its digest (INV-36): it authenticates while the key that started
-- its session is active, and until 24 h after the session closed -- an OPEN
-- session past expires_at reads as closed then, before step (f) marks it
-- (§14.8, the ksc_ token, item 3). The origins are the starting key's.
SELECT cs.id, cs.organization_id, cs.publishable_key_id, pk.allowed_origins
FROM checkout_session cs
JOIN publishable_key pk
  ON pk.id = cs.publishable_key_id
 AND pk.organization_id = cs.organization_id
WHERE cs.lookup_hash = sqlc.arg(lookup_hash)
  AND pk.revoked_at IS NULL
  AND COALESCE(cs.closed_at,
               CASE WHEN cs.status = 'OPEN' AND cs.expires_at <= (clock_timestamp() AT TIME ZONE 'UTC') THEN cs.expires_at END,
               'infinity'::timestamp)
      > (clock_timestamp() AT TIME ZONE 'UTC') - interval '24 hours';
