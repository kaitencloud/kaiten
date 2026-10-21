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


-- name: TrialConsumedByEmail :one
-- One trial per e-mail and family (INV-35): whether a customer of the
-- organization whose lower-cased billing e-mail is the visitor's has consumed
-- a trial of the family of this licence version.
SELECT EXISTS (SELECT 1
               FROM customer_trial ct
               JOIN customer c
                 ON c.id = ct.customer_id
                AND c.organization_id = ct.organization_id
               JOIN license l
                 ON l.family_id = ct.license_family_id
                AND l.organization_id = ct.organization_id
               WHERE ct.organization_id = sqlc.arg(organization_id)
                 AND l.id = sqlc.arg(license_id)
                 AND lower(c.billing_email) = lower(sqlc.arg(email)::text))::boolean AS consumed;


-- name: HasCheckoutFallback :one
-- Whether the family of this licence version names a fallback family with a
-- default PUBLISHED version: what an anonymous checkout with an amount due
-- creates its instance on until the payment (§9.12, §14.8 rule 5).
SELECT EXISTS (SELECT 1
               FROM license l
               JOIN license_family f
                 ON f.id = l.family_id
                AND f.organization_id = l.organization_id
               JOIN license fallback
                 ON fallback.family_id = f.fallback_license_family_id
                AND fallback.organization_id = f.organization_id
               WHERE l.organization_id = sqlc.arg(organization_id)
                 AND l.id = sqlc.arg(license_id)
                 AND fallback.is_default
                 AND fallback.lifecycle_state = 'PUBLISHED')::boolean AS has_fallback;


-- name: InsertCheckoutSession :one
-- The one row an anonymous checkout's start writes (INV-34): OPEN for 24 h.
INSERT INTO checkout_session (organization_id, publishable_key_id, lookup_hash, email, client_reference_id,
                              license_price_id, selection, due_today_minor, currency, trial_refused_reason,
                              return_url, created_at, expires_at, updated_at)
VALUES (sqlc.arg(organization_id), sqlc.arg(publishable_key_id), sqlc.arg(lookup_hash), sqlc.arg(email),
        sqlc.narg(client_reference_id), sqlc.arg(license_price_id), sqlc.arg(selection), sqlc.arg(due_today_minor),
        sqlc.arg(currency), sqlc.narg(trial_refused_reason), sqlc.arg(return_url),
        date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC'),
        date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC') + interval '24 hours',
        date_trunc('milliseconds', clock_timestamp() AT TIME ZONE 'UTC'))
RETURNING *;


-- name: GetCheckoutSession :one
-- One session, with what its price says of it.
SELECT cs.*, lp.billing_period AS price_billing_period, l.slug AS license_slug, l.id AS license_id,
       c.slug AS customer_slug, i.slug AS instance_slug
FROM checkout_session cs
JOIN license_price lp
  ON lp.id = cs.license_price_id
 AND lp.organization_id = cs.organization_id
JOIN license l
  ON l.id = lp.license_id
 AND l.organization_id = lp.organization_id
LEFT JOIN customer c
  ON c.id = cs.customer_id
 AND c.organization_id = cs.organization_id
LEFT JOIN instance i
  ON i.id = cs.instance_id
 AND i.organization_id = cs.organization_id
WHERE cs.organization_id = sqlc.arg(organization_id)
  AND cs.id = sqlc.arg(id);
