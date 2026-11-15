-- name: InstanceHasAI :one
SELECT EXISTS (
 SELECT 1 FROM instance i WHERE i.organization_id = sqlc.arg(organization_id) AND i.slug = sqlc.arg(slug)
 AND (
 EXISTS(SELECT 1 FROM instance_effective_entitlement g JOIN entitlement e ON e.id = g.entitlement_id WHERE g.instance_id = i.id AND g.organization_id = i.organization_id AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM entitlement_usage u JOIN entitlement e ON e.id = u.entitlement_id WHERE u.instance_id = i.id AND u.organization_id = i.organization_id AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM instance_entitlement_exception x JOIN entitlement e ON e.id = x.entitlement_id WHERE x.instance_id = i.id AND x.organization_id = i.organization_id AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM ai_inference a WHERE a.instance_id = i.id AND a.organization_id = i.organization_id)
 ))::boolean;

-- name: GetUsageTargetType :one
-- Attempt accounting needs the original catalogue type before validation or
-- pair-loading failures. This is query-only, organization-scoped, and does not
-- read grants, prices, operations, reservations or usage counters.
SELECT e.type FROM entitlement e
WHERE e.organization_id = sqlc.arg(organization_id) AND e.slug = sqlc.arg(slug);
