-- name: ListAIInferences :many
SELECT a.*, m.slug AS model_slug FROM ai_inference a
LEFT JOIN model m ON m.id=a.model_id AND m.organization_id=a.organization_id
WHERE a.organization_id=sqlc.arg(organization_id) AND a.instance_id=sqlc.arg(instance_id) AND a.entitlement_id=sqlc.arg(entitlement_id)
AND a.reported_at >= sqlc.arg(from_at)::timestamp AND a.reported_at < sqlc.arg(to_at)::timestamp
AND (sqlc.narg(status)::ai_inference_status IS NULL OR a.status=sqlc.narg(status))
AND (sqlc.narg(transaction_id)::text IS NULL OR a.transaction_id=sqlc.narg(transaction_id))
AND (sqlc.narg(cursor_at)::timestamp IS NULL OR (a.reported_at,a.id)<(sqlc.narg(cursor_at)::timestamp,sqlc.narg(cursor_id)::uuid))
ORDER BY a.reported_at DESC,a.id DESC LIMIT sqlc.arg(limit_plus_one);

-- name: ListAIReservations :many
SELECT a.*, m.slug AS model_slug FROM ai_inference a
LEFT JOIN model m ON m.id=a.model_id AND m.organization_id=a.organization_id
WHERE a.organization_id=sqlc.arg(organization_id) AND a.instance_id=sqlc.arg(instance_id) AND a.entitlement_id=sqlc.arg(entitlement_id)
AND a.status='RESERVED' AND a.expires_at>(clock_timestamp() AT TIME ZONE 'UTC')
ORDER BY a.reported_at DESC,a.id DESC;

-- name: ResolveAIReadPair :one
SELECT i.id AS instance_id,e.id AS entitlement_id FROM instance i
JOIN entitlement e ON e.organization_id=i.organization_id AND e.slug=sqlc.arg(entitlement_slug)
JOIN instance_effective_entitlement iee ON iee.organization_id=i.organization_id AND iee.instance_id=i.id AND iee.entitlement_id=e.id
WHERE i.organization_id=sqlc.arg(organization_id) AND i.slug=sqlc.arg(instance_slug) AND e.type='NUMBER_AI_CREDIT';
