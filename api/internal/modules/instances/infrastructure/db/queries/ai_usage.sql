-- name: GetAIModel :one
SELECT m.id, m.status FROM model m
WHERE m.organization_id = sqlc.arg(organization_id)
AND (m.slug = sqlc.arg(model_ref) OR EXISTS (SELECT 1 FROM model_external_id e WHERE e.organization_id = m.organization_id AND e.model_id = m.id AND e.external_id = sqlc.arg(model_ref)))
ORDER BY (m.slug = sqlc.arg(model_ref)) DESC LIMIT 1;

-- name: GetAIRules :many
SELECT * FROM credit_conversion_rule WHERE organization_id = sqlc.arg(organization_id)
AND license_id = sqlc.arg(license_id) AND entitlement_id = sqlc.arg(entitlement_id) AND status = 'ACTIVE';

-- name: GetAIReserved :one
SELECT COALESCE(SUM(credits_reserved),0)::numeric AS reserved FROM ai_inference
WHERE organization_id = sqlc.arg(organization_id) AND instance_id = sqlc.arg(instance_id)
AND entitlement_id = sqlc.arg(entitlement_id) AND status = 'RESERVED' AND expires_at > sqlc.arg(now)::timestamp;

-- name: GetAIOperation :one
SELECT * FROM ai_inference WHERE organization_id = sqlc.arg(organization_id)
AND instance_id = sqlc.arg(instance_id) AND entitlement_id = sqlc.arg(entitlement_id)
AND transaction_id = sqlc.arg(transaction_id) AND reported_at >= sqlc.arg(since)::timestamp
ORDER BY reported_at DESC, id DESC LIMIT 1;

-- name: InsertAIOperation :exec
INSERT INTO ai_inference (id, organization_id, instance_id, entitlement_id, transaction_id, status,
reported_at, committed_at, expires_at, model_ref, model_id, request_type, request_status,
input_tokens, cache_read_input_tokens, cache_write_input_tokens, output_tokens, units, unit_type, duration_ms,
credit_conversion_rule_id, authorized, denial_reason, credits_reserved, credits_computed, credits_charged,
value_before, value_after, window_start, request_hash, commit_hash)
VALUES (sqlc.arg(id), sqlc.arg(organization_id), sqlc.arg(instance_id), sqlc.arg(entitlement_id), sqlc.arg(transaction_id), sqlc.arg(status),
sqlc.arg(reported_at), sqlc.narg(committed_at), sqlc.narg(expires_at), sqlc.arg(model_ref), sqlc.narg(model_id), sqlc.arg(request_type), sqlc.narg(request_status),
sqlc.narg(input_tokens), sqlc.narg(cache_read_input_tokens), sqlc.narg(cache_write_input_tokens), sqlc.narg(output_tokens), sqlc.narg(units), sqlc.narg(unit_type), sqlc.narg(duration_ms),
sqlc.narg(credit_conversion_rule_id), sqlc.narg(authorized), sqlc.narg(denial_reason), sqlc.narg(credits_reserved), sqlc.narg(credits_computed), sqlc.narg(credits_charged),
sqlc.narg(value_before), sqlc.narg(value_after), sqlc.narg(window_start), sqlc.arg(request_hash), sqlc.narg(commit_hash));

-- name: CommitAIOperation :execrows
UPDATE ai_inference SET status = sqlc.arg(status), committed_at = sqlc.arg(committed_at),
model_ref = sqlc.arg(model_ref), model_id = sqlc.narg(model_id), request_type = sqlc.arg(request_type), request_status = sqlc.arg(request_status),
input_tokens = sqlc.narg(input_tokens), cache_read_input_tokens = sqlc.narg(cache_read_input_tokens), cache_write_input_tokens = sqlc.narg(cache_write_input_tokens),
output_tokens = sqlc.narg(output_tokens), units = sqlc.narg(units), unit_type = sqlc.narg(unit_type), duration_ms = sqlc.narg(duration_ms),
credit_conversion_rule_id = sqlc.narg(credit_conversion_rule_id), authorized = sqlc.arg(authorized), denial_reason = sqlc.narg(denial_reason),
credits_computed = sqlc.arg(credits_computed), credits_charged = sqlc.arg(credits_charged), value_before = sqlc.narg(value_before), value_after = sqlc.narg(value_after),
window_start = sqlc.narg(window_start), commit_hash = sqlc.arg(commit_hash)
WHERE id = sqlc.arg(id) AND organization_id = sqlc.arg(organization_id) AND status IN ('RESERVED','EXPIRED');

-- name: AIUnauthorizedRecordedToday :one
SELECT EXISTS(SELECT 1 FROM ai_inference WHERE organization_id = sqlc.arg(organization_id)
AND instance_id = sqlc.arg(instance_id) AND entitlement_id = sqlc.arg(entitlement_id)
AND model_ref = sqlc.arg(model_ref) AND request_type = sqlc.arg(request_type) AND authorized = false
AND committed_at >= sqlc.arg(day_start)::timestamp AND committed_at < sqlc.arg(day_end)::timestamp);

-- name: StoreAIPhaseResponse :execrows
UPDATE ai_inference SET
reserve_response = CASE WHEN sqlc.arg(phase)::text = 'reserve' THEN sqlc.arg(response)::jsonb ELSE reserve_response END,
commit_response = CASE WHEN sqlc.arg(phase)::text = 'commit' THEN sqlc.arg(response)::jsonb ELSE commit_response END
WHERE id = sqlc.arg(id) AND organization_id = sqlc.arg(organization_id)
AND ((sqlc.arg(phase)::text='reserve' AND reserve_response IS NULL) OR (sqlc.arg(phase)::text='commit' AND commit_response IS NULL));

-- name: ExpireAIReservations :many
WITH expired AS (
 SELECT id FROM ai_inference WHERE status = 'RESERVED' AND expires_at <= (clock_timestamp() AT TIME ZONE 'UTC')
 ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED
)
UPDATE ai_inference SET status = 'EXPIRED' WHERE id IN (SELECT id FROM expired) RETURNING id;

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
JOIN license_entitlement le ON le.organization_id=i.organization_id AND le.license_id=i.license_id AND le.entitlement_id=e.id
WHERE i.organization_id=sqlc.arg(organization_id) AND i.slug=sqlc.arg(instance_slug) AND e.type='NUMBER_AI_CREDIT';
