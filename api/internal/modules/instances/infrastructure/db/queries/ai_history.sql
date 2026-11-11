-- name: ListAIInferences :many
-- One page of a pair's operations, newest first. Every filter is optional;
-- model_slug is the catalogue model the operation resolved to, model_ref the
-- model as sent (the only handle on a model the catalogue does not know).
SELECT sqlc.embed(a), m.slug AS model_slug, l.slug AS license_slug FROM ai_inference a
LEFT JOIN model m ON m.id=a.model_id AND m.organization_id=a.organization_id
LEFT JOIN license l ON l.id=a.license_id AND l.organization_id=a.organization_id
WHERE a.organization_id=sqlc.arg(organization_id) AND a.instance_id=sqlc.arg(instance_id) AND a.entitlement_id=sqlc.arg(entitlement_id)
AND a.reported_at >= sqlc.arg(from_at)::timestamp AND a.reported_at < sqlc.arg(to_at)::timestamp
AND (sqlc.narg(status)::ai_inference_status IS NULL OR a.status=sqlc.narg(status))
AND (sqlc.narg(transaction_id)::text IS NULL OR a.transaction_id=sqlc.narg(transaction_id))
AND (sqlc.narg(authorized)::boolean IS NULL OR a.authorized=sqlc.narg(authorized))
AND (sqlc.narg(model_slug)::text IS NULL OR m.slug=sqlc.narg(model_slug))
AND (sqlc.narg(model_ref)::text IS NULL OR a.model_ref=sqlc.narg(model_ref))
AND (sqlc.narg(request_type)::ai_request_type IS NULL OR a.request_type=sqlc.narg(request_type))
AND (sqlc.narg(cursor_at)::timestamp IS NULL OR (a.reported_at,a.id)<(sqlc.narg(cursor_at)::timestamp,sqlc.narg(cursor_id)::uuid))
ORDER BY a.reported_at DESC,a.id DESC LIMIT sqlc.arg(limit_plus_one);

-- name: ListAIReservations :many
SELECT sqlc.embed(a), m.slug AS model_slug, l.slug AS license_slug FROM ai_inference a
LEFT JOIN model m ON m.id=a.model_id AND m.organization_id=a.organization_id
LEFT JOIN license l ON l.id=a.license_id AND l.organization_id=a.organization_id
WHERE a.organization_id=sqlc.arg(organization_id) AND a.instance_id=sqlc.arg(instance_id) AND a.entitlement_id=sqlc.arg(entitlement_id)
AND a.status='RESERVED' AND a.expires_at>(clock_timestamp() AT TIME ZONE 'UTC')
ORDER BY a.reported_at DESC,a.id DESC;

-- name: ResolveAIReadPair :one
-- History outlives the grant: the pair resolves from the instance and the
-- credit pool alone, so a pool removed from the licence keeps its record.
SELECT i.id AS instance_id,e.id AS entitlement_id FROM instance i
JOIN entitlement e ON e.organization_id=i.organization_id AND e.slug=sqlc.arg(entitlement_slug)
WHERE i.organization_id=sqlc.arg(organization_id) AND i.slug=sqlc.arg(instance_slug) AND e.type='NUMBER_AI_CREDIT';

-- name: ListOrganizationAIInferences :many
-- One page of the organization's operations across instances and pools, in
-- the keyset order of idx_ai_inference_org_reported_at. A slug filter that
-- names nothing in the organization (another tenant's included) matches no
-- row. The instance and pool slugs are absent once those are deleted.
SELECT sqlc.embed(a), m.slug AS model_slug, l.slug AS license_slug, i.slug AS instance_slug, e.slug AS entitlement_slug FROM ai_inference a
LEFT JOIN model m ON m.id=a.model_id AND m.organization_id=a.organization_id
LEFT JOIN license l ON l.id=a.license_id AND l.organization_id=a.organization_id
LEFT JOIN instance i ON i.id=a.instance_id AND i.organization_id=a.organization_id
LEFT JOIN entitlement e ON e.id=a.entitlement_id AND e.organization_id=a.organization_id
WHERE a.organization_id=sqlc.arg(organization_id)
AND a.reported_at >= sqlc.arg(from_at)::timestamp AND a.reported_at < sqlc.arg(to_at)::timestamp
AND (sqlc.narg(instance_slug)::text IS NULL OR a.instance_id=(SELECT si.id FROM instance si WHERE si.organization_id=sqlc.arg(organization_id) AND si.slug=sqlc.narg(instance_slug)))
AND (sqlc.narg(entitlement_slug)::text IS NULL OR a.entitlement_id=(SELECT se.id FROM entitlement se WHERE se.organization_id=sqlc.arg(organization_id) AND se.slug=sqlc.narg(entitlement_slug)))
AND (sqlc.narg(status)::ai_inference_status IS NULL OR a.status=sqlc.narg(status))
AND (sqlc.narg(transaction_id)::text IS NULL OR a.transaction_id=sqlc.narg(transaction_id))
AND (sqlc.narg(authorized)::boolean IS NULL OR a.authorized=sqlc.narg(authorized))
AND (sqlc.narg(model_slug)::text IS NULL OR m.slug=sqlc.narg(model_slug))
AND (sqlc.narg(model_ref)::text IS NULL OR a.model_ref=sqlc.narg(model_ref))
AND (sqlc.narg(request_type)::ai_request_type IS NULL OR a.request_type=sqlc.narg(request_type))
AND (sqlc.narg(cursor_at)::timestamp IS NULL OR (a.reported_at,a.id)<(sqlc.narg(cursor_at)::timestamp,sqlc.narg(cursor_id)::uuid))
ORDER BY a.reported_at DESC,a.id DESC LIMIT sqlc.arg(limit_plus_one);
