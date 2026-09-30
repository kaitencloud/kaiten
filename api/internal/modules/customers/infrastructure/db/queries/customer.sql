-- name: CreateCustomer :one
WITH inserted AS (
  INSERT INTO customer (name, slug, external_customer_id, domain, created_by_id, updated_by_id, organization_id)
  SELECT $1, $2, $3, $4, uo.user_id, uo.user_id, uo.organization_id
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
         AND uo.user_id = sqlc.arg(user_id)
         AND uo.deleted_at IS NULL
  RETURNING *
)
SELECT inserted.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name
FROM inserted
  INNER JOIN "user" creator ON inserted.created_by_id = creator.id
  INNER JOIN "user" updater ON inserted.updated_by_id = updater.id;


-- name: GetCustomers :many
-- Cursor (keyset) pagination: ordered by created_at DESC, id DESC (id
-- tie-breaks created_at, which is not guaranteed unique). Pass
-- limit_plus_one = requested limit + 1 so the caller can detect whether a
-- further page exists without a separate COUNT query. On the first page,
-- pass NULL for both cursor_created_at and cursor_id. Pass NULL for
-- adapter to page over every customer, or an adapter name to keep only
-- the customers synced with that integration (a matching
-- customer_integrations row with a non-empty external_id).
SELECT c.id,
       c.name,
       c.slug,
       external_customer_id,
  c.domain,
       c.created_by_id,
       creator.name AS created_by_name,
       c.created_at,
       c.updated_by_id,
       updater.name AS updated_by_name,
       c.updated_at,
       c.organization_id
FROM customer c
  INNER JOIN "user" creator ON c.created_by_id = creator.id
  INNER JOIN "user" updater ON c.updated_by_id = updater.id
WHERE c.organization_id = sqlc.arg(organization_id)
  AND (
    sqlc.narg(adapter)::text IS NULL
    OR EXISTS (
      SELECT 1
      FROM customer_integrations ci
      WHERE ci.customer_id = c.id
        AND ci.organization_id = c.organization_id
        AND ci.adapter = sqlc.narg(adapter)::text
        AND ci.external_id <> ''
    )
  )
  AND (
    sqlc.narg(cursor_created_at)::timestamp IS NULL
    OR (c.created_at, c.id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid)
  )
ORDER BY c.created_at DESC, c.id DESC
LIMIT sqlc.arg(limit_plus_one);


-- name: GetOneCustomer :one
SELECT c.id,
       c.name,
       c.slug,
       external_customer_id,
  c.domain,
       c.created_by_id,
       creator.name AS created_by_name,
       c.created_at,
       c.updated_by_id,
       updater.name AS updated_by_name,
       c.updated_at,
       c.organization_id
FROM customer c
  INNER JOIN "user" creator ON c.created_by_id = creator.id
  INNER JOIN "user" updater ON c.updated_by_id = updater.id
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.slug = sqlc.arg(slug);


-- name: GetCustomersByExternalID :many
-- `external_customer_id` carries the host's own tenant id and has no unique
-- constraint, so this is deliberately :many — the caller decides what an
-- ambiguous match means rather than silently getting an arbitrary row.
SELECT c.id,
       c.name,
       c.slug,
       external_customer_id,
  c.domain,
       c.created_by_id,
       creator.name AS created_by_name,
       c.created_at,
       c.updated_by_id,
       updater.name AS updated_by_name,
       c.updated_at,
       c.organization_id
FROM customer c
  INNER JOIN "user" creator ON c.created_by_id = creator.id
  INNER JOIN "user" updater ON c.updated_by_id = updater.id
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.external_customer_id = sqlc.arg(external_customer_id);


-- name: UpdateCustomer :one
WITH updated AS (
  UPDATE customer c
  SET name          = $1,
      external_customer_id = $2,
    domain = $3,
      updated_by_id = uo.user_id,
      updated_at    = now()
  FROM user_on_organization uo
  WHERE uo.organization_id = sqlc.arg(organization_id)
     AND uo.user_id = sqlc.arg(user_id)
         AND uo.deleted_at IS NULL
         AND c.organization_id = uo.organization_id
         AND c.slug = sqlc.arg(slug)
  RETURNING c.*
)
SELECT updated.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name
FROM updated
  INNER JOIN "user" creator ON updated.created_by_id = creator.id
  INNER JOIN "user" updater ON updated.updated_by_id = updater.id;


-- name: DeleteCustomer :one
WITH deleted AS (
  DELETE
  FROM customer c
  WHERE c.slug = sqlc.arg(slug)
         AND c.organization_id = sqlc.arg(organization_id)
  RETURNING c.*
)
SELECT deleted.*,
       creator.name AS created_by_name,
       updater.name AS updated_by_name
FROM deleted
  INNER JOIN "user" creator ON deleted.created_by_id = creator.id
  INNER JOIN "user" updater ON deleted.updated_by_id = updater.id;


-- name: GetCustomersByIDs :many
SELECT c.id,
       c.name,
       c.slug,
       external_customer_id,
  c.domain,
       c.created_by_id,
       creator.name AS created_by_name,
       c.created_at,
       c.updated_by_id,
       updater.name AS updated_by_name,
       c.updated_at,
       c.organization_id
FROM customer c
  INNER JOIN "user" creator ON c.created_by_id = creator.id
  INNER JOIN "user" updater ON c.updated_by_id = updater.id
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.id = ANY (sqlc.arg(customer_ids)::uuid[]);


-- name: SetCustomerExternalIDByID :execrows
UPDATE customer c
SET external_customer_id = sqlc.arg(external_customer_id),
    updated_at = now()
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.id = sqlc.arg(customer_id);


-- name: GetCustomerExternalIDByID :one
SELECT c.external_customer_id
FROM customer c
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.id = sqlc.arg(customer_id);


-- name: GetCustomerNameByID :one
SELECT c.name
FROM customer c
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.id = sqlc.arg(customer_id);

-- Server-side facts for feature-flag targeting: the licence a customer's
-- instance carries, the family that licence is a version of, and every
-- entitlement on it with its recorded usage.
-- Targeting rules are evaluated against these, never against attributes the
-- client sent, or a rule on someone's plan or quota would be spoofable.
--
-- One row per entitlement, the licence columns repeated: a single round trip on
-- the most-called path of the product, and the caller shapes the rest.
--
-- SCOPED TO ONE INSTANCE, and that is a correctness requirement rather than a
-- cheap way to return fewer rows. Limits live on the licence
-- (license_entitlement.license_id) while usage lives on the instance
-- (entitlement_usage PK is entitlement_id + instance_id), so each instance
-- consumes its OWN allowance of the licence's threshold. Two instances at half
-- their cap are two half-full instances, not one full customer — summing them
-- would invent a saturation nobody reached.
--
-- Returning every instance's rows instead let the caller key them by
-- entitlement slug, where later instances silently overwrote earlier ones: the
-- licence came from the oldest instance and the usage from the newest, a
-- customer that exists nowhere. The oldest active instance is the customer's
-- original one, which is also the licence the previous shape happened to
-- report — so single-instance customers, the overwhelming case, are unaffected.
--
-- The family's slug is what a rule targets a product by: the licence slug
-- names one version and changes with every new one. Every licence has
-- a family in its own organization (license_family_id_fkey), so the join never
-- drops the row.

-- name: GetTargetingFactsByCustomerSlug :many
WITH primary_instance AS (
  SELECT i.id, i.license_id
  FROM instance i
         JOIN customer c ON c.id = i.customer_id AND c.organization_id = i.organization_id
  WHERE c.organization_id = sqlc.arg(organization_id)
    AND c.slug = sqlc.arg(customer_slug)
  -- id breaks a created_at tie, so the choice never depends on row order.
  ORDER BY i.created_at, i.id
  LIMIT 1
)
SELECT l.slug           AS license_slug,
       lf.slug          AS license_family_slug,
       l.type           AS license_type,
       e.slug           AS entitlement_slug,
       le.value         AS limit_value,
       eu.value         AS usage_value
FROM primary_instance pi
       JOIN "license" l ON l.id = pi.license_id
       JOIN license_family lf ON lf.id = l.family_id AND lf.organization_id = l.organization_id
       LEFT JOIN license_entitlement le
         ON le.license_id = l.id AND le.organization_id = sqlc.arg(organization_id)
       LEFT JOIN entitlement e
         ON e.id = le.entitlement_id AND e.organization_id = sqlc.arg(organization_id)
       LEFT JOIN entitlement_usage eu
         ON eu.instance_id = pi.id
        AND eu.entitlement_id = e.id
        AND eu.organization_id = sqlc.arg(organization_id)
ORDER BY e.slug;
