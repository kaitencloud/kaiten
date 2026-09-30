-- name: UpsertCustomerIntegrationExternalID :execrows
INSERT INTO customer_integrations (customer_id, organization_id, adapter, external_id, synced_at, last_error)
SELECT c.id,
       c.organization_id,
       sqlc.arg(adapter),
       sqlc.arg(external_id),
       now(),
       NULL
FROM customer c
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.id = sqlc.arg(customer_id)
ON CONFLICT (customer_id, adapter)
DO UPDATE SET external_id = EXCLUDED.external_id,
              synced_at = EXCLUDED.synced_at,
              last_error = NULL;


-- name: UpsertCustomerIntegration :execrows
INSERT INTO customer_integrations (customer_id, organization_id, adapter, external_id, metadata, web_url, synced_at, last_error)
SELECT c.id,
       c.organization_id,
       sqlc.arg(adapter),
       sqlc.arg(external_id),
       sqlc.arg(metadata),
       sqlc.narg(web_url)::text,
       sqlc.narg(synced_at)::timestamptz,
       sqlc.narg(last_error)::text
FROM customer c
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.id = sqlc.arg(customer_id)
ON CONFLICT (customer_id, adapter)
DO UPDATE SET external_id = EXCLUDED.external_id,
              metadata = EXCLUDED.metadata,
              web_url = EXCLUDED.web_url,
              synced_at = EXCLUDED.synced_at,
              last_error = EXCLUDED.last_error;


-- name: GetCustomerIntegrationExternalID :one
SELECT ci.external_id
FROM customer c
LEFT JOIN customer_integrations ci
  ON ci.customer_id = c.id
  AND ci.organization_id = c.organization_id
  AND ci.adapter = sqlc.arg(adapter)
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.id = sqlc.arg(customer_id);


-- name: GetCustomerIntegrations :many
SELECT ci.adapter,
       ci.external_id,
  ci.metadata,
  ci.web_url,
  ci.synced_at,
  ci.last_error
FROM customer_integrations ci
WHERE ci.organization_id = sqlc.arg(organization_id)
  AND ci.customer_id = sqlc.arg(customer_id);


-- name: GetCustomerIntegration :one
SELECT ci.external_id,
       ci.metadata,
       ci.web_url,
       ci.synced_at,
       ci.last_error
FROM customer_integrations ci
WHERE ci.organization_id = sqlc.arg(organization_id)
  AND ci.customer_id = sqlc.arg(customer_id)
  AND ci.adapter = sqlc.arg(adapter);


-- name: GetCustomerByIntegrationExternalID :one
SELECT c.id,
       c.name,
       c.slug,
       c.external_customer_id,
       c.domain,
       ci.external_id AS integration_external_id,
       ci.metadata AS integration_metadata,
       ci.web_url AS integration_web_url,
       ci.synced_at AS integration_synced_at,
       ci.last_error AS integration_last_error
FROM customer_integrations ci
INNER JOIN customer c
  ON c.id = ci.customer_id
 AND c.organization_id = ci.organization_id
WHERE ci.organization_id = sqlc.arg(organization_id)
  AND ci.adapter = sqlc.arg(adapter)
  AND ci.external_id = sqlc.arg(external_id);


-- name: DeleteCustomerIntegration :execrows
DELETE FROM customer_integrations
WHERE organization_id = sqlc.arg(organization_id)
  AND customer_id = sqlc.arg(customer_id)
  AND adapter = sqlc.arg(adapter);


-- name: UpdateCustomerSlugByID :execrows
UPDATE customer c
SET slug = sqlc.arg(slug),
    updated_by_id = sqlc.arg(user_id),
    updated_at = now()
WHERE c.organization_id = sqlc.arg(organization_id)
  AND c.id = sqlc.arg(customer_id);


-- name: GetCustomerIntegrationsByCustomerIDs :many
SELECT ci.customer_id,
       ci.adapter,
       ci.external_id,
  ci.metadata,
  ci.web_url,
  ci.synced_at,
  ci.last_error
FROM customer_integrations ci
WHERE ci.organization_id = sqlc.arg(organization_id)
  AND ci.customer_id = ANY(sqlc.arg(customer_ids)::uuid[]);
