-- name: LockModelCatalogue :exec
-- Identity checks span both tables, so every catalogue write takes this
-- organization-scoped lock before checking either namespace.
SELECT pg_advisory_xact_lock(hashtextextended('models:' || sqlc.arg(organization_id)::uuid::text, 0));

-- name: ModelSlugExists :one
SELECT EXISTS(SELECT 1 FROM model WHERE organization_id = sqlc.arg(organization_id) AND slug = sqlc.arg(slug));

-- name: ModelExternalIDsConflict :one
SELECT EXISTS (
  SELECT 1 FROM model_external_id e WHERE e.organization_id = sqlc.arg(organization_id)
    AND e.model_id <> sqlc.arg(model_id) AND e.external_id = ANY(sqlc.arg(external_ids)::text[])
  UNION ALL
  SELECT 1 FROM model m WHERE m.organization_id = sqlc.arg(organization_id)
    AND m.id <> sqlc.arg(model_id) AND m.slug = ANY(sqlc.arg(external_ids)::text[])
);

-- name: ModelSlugIsExternalID :one
SELECT EXISTS(SELECT 1 FROM model_external_id WHERE organization_id = sqlc.arg(organization_id) AND external_id = sqlc.arg(slug));

-- name: CreateModel :one
INSERT INTO model (name, slug, description, vendor, modality, status, vendor_cost_per_input_token, vendor_cost_per_cached_input_token, vendor_cost_per_cache_write_token, vendor_cost_per_output_token, vendor_cost_per_request, vendor_cost_per_unit, vendor_cost_currency, metadata, created_by_id, updated_by_id, organization_id)
SELECT sqlc.arg(name), sqlc.arg(slug), sqlc.narg(description), sqlc.arg(vendor), sqlc.arg(modality), sqlc.arg(status), sqlc.narg(vendor_cost_per_input_token), sqlc.narg(vendor_cost_per_cached_input_token), sqlc.narg(vendor_cost_per_cache_write_token), sqlc.narg(vendor_cost_per_output_token), sqlc.narg(vendor_cost_per_request), sqlc.narg(vendor_cost_per_unit), sqlc.arg(vendor_cost_currency), sqlc.arg(metadata), uo.user_id, uo.user_id, uo.organization_id
FROM user_on_organization uo
WHERE uo.organization_id = sqlc.arg(organization_id) AND uo.user_id = sqlc.arg(user_id) AND uo.deleted_at IS NULL
RETURNING *;

-- name: UpdateModel :one
UPDATE model m SET name = sqlc.arg(name), description = sqlc.narg(description), vendor = sqlc.arg(vendor), status = sqlc.arg(status), vendor_cost_per_input_token = sqlc.narg(vendor_cost_per_input_token), vendor_cost_per_cached_input_token = sqlc.narg(vendor_cost_per_cached_input_token), vendor_cost_per_cache_write_token = sqlc.narg(vendor_cost_per_cache_write_token), vendor_cost_per_output_token = sqlc.narg(vendor_cost_per_output_token), vendor_cost_per_request = sqlc.narg(vendor_cost_per_request), vendor_cost_per_unit = sqlc.narg(vendor_cost_per_unit), vendor_cost_currency = sqlc.arg(vendor_cost_currency), metadata = sqlc.arg(metadata), updated_by_id = uo.user_id, updated_at = now()
FROM user_on_organization uo
WHERE uo.organization_id = sqlc.arg(organization_id) AND uo.user_id = sqlc.arg(user_id) AND uo.deleted_at IS NULL
  AND m.organization_id = uo.organization_id AND m.id = sqlc.arg(model_id)
RETURNING m.*;

-- name: DeleteModel :exec
DELETE FROM model WHERE organization_id = sqlc.arg(organization_id) AND id = sqlc.arg(model_id);

-- name: ModelInUse :one
-- Archived rules still reference the model, and block its hard deletion too.
SELECT EXISTS(SELECT 1 FROM credit_conversion_rule WHERE organization_id = sqlc.arg(organization_id) AND model_id = sqlc.arg(model_id));

-- name: GetModel :one
SELECT * FROM model WHERE organization_id = sqlc.arg(organization_id) AND slug = sqlc.arg(slug);

-- name: ListModels :many
SELECT * FROM model
WHERE organization_id = sqlc.arg(organization_id)
  AND (sqlc.narg(status)::model_status IS NULL OR status = sqlc.narg(status))
  AND (sqlc.narg(vendor)::text IS NULL OR vendor = sqlc.narg(vendor))
  AND (sqlc.narg(modality)::model_modality IS NULL OR modality = sqlc.narg(modality))
  AND (sqlc.narg(cursor_created_at)::timestamp IS NULL OR (created_at, id) < (sqlc.narg(cursor_created_at)::timestamp, sqlc.narg(cursor_id)::uuid))
ORDER BY created_at DESC, id DESC LIMIT sqlc.arg(limit_plus_one);

-- name: AllModels :many
SELECT * FROM model WHERE organization_id = sqlc.arg(organization_id)
  AND (sqlc.narg(status)::model_status IS NULL OR status = sqlc.narg(status))
ORDER BY created_at DESC, id DESC;

-- name: GetModelExternalIDs :many
SELECT model_id, external_id FROM model_external_id
WHERE organization_id = sqlc.arg(organization_id) AND model_id = ANY(sqlc.arg(model_ids)::uuid[])
ORDER BY external_id;

-- name: DeleteModelExternalIDs :exec
DELETE FROM model_external_id WHERE organization_id = sqlc.arg(organization_id) AND model_id = sqlc.arg(model_id);

-- name: InsertModelExternalIDs :exec
INSERT INTO model_external_id (organization_id, model_id, external_id)
SELECT sqlc.arg(organization_id), sqlc.arg(model_id), unnest(sqlc.arg(external_ids)::text[]);
