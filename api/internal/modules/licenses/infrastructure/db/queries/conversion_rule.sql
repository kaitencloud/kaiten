-- name: LockConversionRuleModelCatalogue :exec
-- Same lock as catalogue writes: an ACTIVE check must survive until insertion.
SELECT pg_advisory_xact_lock(hashtextextended('models:' || sqlc.arg(organization_id)::uuid::text, 0));

-- name: ConversionRuleEntitlement :one
SELECT id, type, aggregation_method FROM entitlement
WHERE organization_id = sqlc.arg(organization_id) AND slug = sqlc.arg(slug);

-- name: ConversionRuleModel :one
SELECT id, status FROM model
WHERE organization_id = sqlc.arg(organization_id) AND slug = sqlc.arg(slug);

-- name: ListConversionRules :many
-- No grant join: grant-less rules remain visible after grant removal.
SELECT c.*, l.slug AS license_slug, e.slug AS entitlement_slug, m.slug AS model_slug,
 EXISTS (SELECT 1 FROM license_entitlement le
   WHERE le.organization_id = c.organization_id AND le.license_id = c.license_id AND le.entitlement_id = c.entitlement_id) AS granted_by_license
FROM credit_conversion_rule c
JOIN license l ON l.id = c.license_id AND l.organization_id = c.organization_id
JOIN entitlement e ON e.id = c.entitlement_id AND e.organization_id = c.organization_id
LEFT JOIN model m ON m.id = c.model_id AND m.organization_id = c.organization_id
WHERE c.organization_id = sqlc.arg(organization_id)
 AND c.license_id = ANY(sqlc.arg(license_ids)::uuid[])
 AND (sqlc.narg(rule_id)::uuid IS NULL OR c.id = sqlc.narg(rule_id))
 AND (sqlc.narg(status)::credit_conversion_rule_status IS NULL OR c.status = sqlc.narg(status))
 AND (sqlc.narg(entitlement_slug)::text IS NULL OR e.slug = sqlc.narg(entitlement_slug))
 AND (sqlc.narg(model_slug)::text IS NULL OR m.slug = sqlc.narg(model_slug))
ORDER BY c.created_at DESC, c.id DESC;

-- name: LockConversionRule :one
SELECT id FROM credit_conversion_rule
WHERE organization_id = sqlc.arg(organization_id) AND license_id = sqlc.arg(license_id) AND id = sqlc.arg(rule_id)
FOR UPDATE;

-- name: CreateConversionRule :one
INSERT INTO credit_conversion_rule (
 organization_id, license_id, entitlement_id, model_id, request_type,
 rate_per_request, rate_per_input_token, rate_per_cached_input_token, rate_per_cache_write_token,
 rate_per_output_token, rate_per_unit, rate_per_second,
 minimum_credits_per_request, maximum_credits_per_request, charge_on_error, created_by_id, updated_by_id)
SELECT uo.organization_id, sqlc.arg(license_id), sqlc.arg(entitlement_id), sqlc.narg(model_id), sqlc.narg(request_type),
 sqlc.narg(rate_per_request), sqlc.narg(rate_per_input_token), sqlc.narg(rate_per_cached_input_token), sqlc.narg(rate_per_cache_write_token),
 sqlc.narg(rate_per_output_token), sqlc.narg(rate_per_unit), sqlc.narg(rate_per_second),
 sqlc.arg(minimum_credits_per_request), sqlc.narg(maximum_credits_per_request), sqlc.arg(charge_on_error), uo.user_id, uo.user_id
FROM user_on_organization uo
WHERE uo.organization_id = sqlc.arg(organization_id) AND uo.user_id = sqlc.arg(user_id) AND uo.deleted_at IS NULL
RETURNING id;

-- name: UpdateConversionRule :execrows
UPDATE credit_conversion_rule c
SET rate_per_request = sqlc.narg(rate_per_request), rate_per_input_token = sqlc.narg(rate_per_input_token),
 rate_per_cached_input_token = sqlc.narg(rate_per_cached_input_token), rate_per_cache_write_token = sqlc.narg(rate_per_cache_write_token),
 rate_per_output_token = sqlc.narg(rate_per_output_token), rate_per_unit = sqlc.narg(rate_per_unit), rate_per_second = sqlc.narg(rate_per_second),
 minimum_credits_per_request = sqlc.arg(minimum_credits_per_request), maximum_credits_per_request = sqlc.narg(maximum_credits_per_request),
 charge_on_error = sqlc.arg(charge_on_error), updated_by_id = uo.user_id, updated_at = now()
FROM user_on_organization uo
WHERE c.organization_id = sqlc.arg(organization_id) AND c.license_id = sqlc.arg(license_id) AND c.id = sqlc.arg(rule_id) AND c.status = 'ACTIVE'
 AND uo.organization_id = c.organization_id AND uo.user_id = sqlc.arg(user_id) AND uo.deleted_at IS NULL;

-- name: ArchiveConversionRule :execrows
UPDATE credit_conversion_rule c SET status = 'ARCHIVED', updated_by_id = uo.user_id, updated_at = now()
FROM user_on_organization uo
WHERE c.organization_id = sqlc.arg(organization_id) AND c.license_id = sqlc.arg(license_id) AND c.id = sqlc.arg(rule_id) AND c.status = 'ACTIVE'
 AND uo.organization_id = c.organization_id AND uo.user_id = sqlc.arg(user_id) AND uo.deleted_at IS NULL;

-- name: ConversionRuleActorIsMember :one
SELECT EXISTS(SELECT 1 FROM user_on_organization
 WHERE organization_id = sqlc.arg(organization_id) AND user_id = sqlc.arg(user_id) AND deleted_at IS NULL);
