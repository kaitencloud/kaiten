-- name: OrganizationHasAI :one
SELECT (
 EXISTS(SELECT 1 FROM entitlement e WHERE e.organization_id = sqlc.arg(organization_id) AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM model m WHERE m.organization_id = sqlc.arg(organization_id))
 OR EXISTS(SELECT 1 FROM credit_conversion_rule r WHERE r.organization_id = sqlc.arg(organization_id))
 OR EXISTS(SELECT 1 FROM ai_inference a WHERE a.organization_id = sqlc.arg(organization_id))
)::boolean;
