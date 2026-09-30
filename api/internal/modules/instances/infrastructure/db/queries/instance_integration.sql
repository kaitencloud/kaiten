-- name: UpsertInstanceIntegrationExternalID :execrows
INSERT INTO instance_integrations (instance_id, organization_id, adapter, external_id, synced_at, last_error)
SELECT i.id,
       i.organization_id,
       sqlc.arg(adapter),
       sqlc.arg(external_id),
       now(),
       NULL
FROM instance i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.id = sqlc.arg(instance_id)
ON CONFLICT (instance_id, adapter)
DO UPDATE SET external_id = EXCLUDED.external_id,
              synced_at = EXCLUDED.synced_at,
              last_error = NULL;


-- name: UpsertInstanceIntegration :execrows
INSERT INTO instance_integrations (instance_id, organization_id, adapter, external_id, metadata, web_url, synced_at, last_error)
SELECT i.id,
       i.organization_id,
       sqlc.arg(adapter),
       sqlc.arg(external_id),
       sqlc.arg(metadata),
       sqlc.narg(web_url)::text,
       sqlc.narg(synced_at)::timestamptz,
       sqlc.narg(last_error)::text
FROM instance i
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.id = sqlc.arg(instance_id)
ON CONFLICT (instance_id, adapter)
DO UPDATE SET external_id = EXCLUDED.external_id,
              metadata = EXCLUDED.metadata,
              web_url = EXCLUDED.web_url,
              synced_at = EXCLUDED.synced_at,
              last_error = EXCLUDED.last_error;


-- name: GetInstanceIntegrationExternalID :one
SELECT ii.external_id
FROM instance i
LEFT JOIN instance_integrations ii
  ON ii.instance_id = i.id
  AND ii.organization_id = i.organization_id
  AND ii.adapter = sqlc.arg(adapter)
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.id = sqlc.arg(instance_id);


-- name: GetInstanceIntegrations :many
SELECT ii.adapter,
       ii.external_id,
  ii.metadata,
  ii.web_url,
  ii.synced_at,
  ii.last_error
FROM instance_integrations ii
WHERE ii.organization_id = sqlc.arg(organization_id)
  AND ii.instance_id = sqlc.arg(instance_id);


-- name: GetInstanceIntegration :one
SELECT ii.external_id,
       ii.metadata,
       ii.web_url,
       ii.synced_at,
       ii.last_error
FROM instance_integrations ii
WHERE ii.organization_id = sqlc.arg(organization_id)
  AND ii.instance_id = sqlc.arg(instance_id)
  AND ii.adapter = sqlc.arg(adapter);


-- name: GetInstanceByIntegrationExternalID :one
SELECT i.id,
       i.name,
       i.slug,
       i.description,
       i.customer_id,
       i.license_id,
       i.deployment_zone_id,
       i.start_license_date,
       i.end_license_date,
       i.metadata,
       ii.external_id AS integration_external_id,
       ii.metadata AS integration_metadata,
       ii.web_url AS integration_web_url,
       ii.synced_at AS integration_synced_at,
       ii.last_error AS integration_last_error,
       ci.external_id AS customer_external_id
FROM instance_integrations ii
INNER JOIN instance i
  ON i.id = ii.instance_id
 AND i.organization_id = ii.organization_id
LEFT JOIN customer_integrations ci
  ON ci.customer_id = i.customer_id
 AND ci.organization_id = i.organization_id
 AND ci.adapter = ii.adapter
WHERE ii.organization_id = sqlc.arg(organization_id)
  AND ii.adapter = sqlc.arg(adapter)
  AND ii.external_id = sqlc.arg(external_id);


-- name: DeleteInstanceIntegration :execrows
DELETE FROM instance_integrations
WHERE organization_id = sqlc.arg(organization_id)
  AND instance_id = sqlc.arg(instance_id)
  AND adapter = sqlc.arg(adapter);


-- name: UpdateInstanceSlugByID :execrows
UPDATE instance i
SET slug = sqlc.arg(slug),
    updated_by_id = sqlc.arg(user_id),
    updated_at = now()
WHERE i.organization_id = sqlc.arg(organization_id)
  AND i.id = sqlc.arg(instance_id);


-- name: GetInstanceIntegrationsByInstanceIDs :many
SELECT ii.instance_id,
       ii.adapter,
       ii.external_id,
  ii.metadata,
  ii.web_url,
  ii.synced_at,
  ii.last_error
FROM instance_integrations ii
WHERE ii.organization_id = sqlc.arg(organization_id)
  AND ii.instance_id = ANY(sqlc.arg(instance_ids)::uuid[]);
