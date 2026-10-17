-- name: GetPortalCustomer :one
-- The session's customer, as its portal names it.
SELECT c.slug, c.name, c.billing_email
FROM customer c
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.id = sqlc.arg(id);


-- name: GetPortalInstance :one
-- The session's instance and its licence version, of the session's customer.
SELECT i.slug, i.name, l.id AS license_id, l.slug AS license_slug, l.name AS license_name, lf.slug AS family_slug
FROM instance i
JOIN "license" l ON l.id = i.license_id AND l.organization_id = i.organization_id
JOIN license_family lf ON lf.id = l.family_id AND lf.organization_id = l.organization_id
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.id = sqlc.arg(id)
  AND i.customer_id = sqlc.arg(customer_id);


-- name: ListPortalInstances :many
-- The customer's instances, with their subscription's status -- empty when
-- they have none -- oldest first.
SELECT i.slug, i.name, l.slug AS license_slug, COALESCE(ib.status::text, '')::text AS billing_status
FROM instance i
JOIN "license" l ON l.id = i.license_id AND l.organization_id = i.organization_id
LEFT JOIN instance_billing ib ON ib.instance_id = i.id AND ib.organization_id = i.organization_id
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.customer_id = sqlc.arg(customer_id)
ORDER BY i.created_at, i.id;


-- name: ListPortalEntitlementNames :many
-- The names and types of entitlements, for the portal's quotas.
SELECT e.id, e.name, e.type::text AS type
FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id)
  AND e.id = ANY (sqlc.arg(ids)::uuid[]);
