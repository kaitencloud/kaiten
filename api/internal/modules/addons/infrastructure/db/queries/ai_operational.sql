-- name: AddonMeterIsAI :one
SELECT EXISTS (SELECT 1 FROM entitlement e WHERE e.organization_id = sqlc.arg(organization_id) AND e.id = sqlc.arg(entitlement_id) AND e.type = 'NUMBER_AI_CREDIT')::boolean;

-- name: AddonHasAI :one
SELECT EXISTS (
 SELECT 1 FROM addon a WHERE a.organization_id = sqlc.arg(organization_id) AND a.id = sqlc.arg(addon_id)
 AND (
 EXISTS(SELECT 1 FROM addon_entitlement g JOIN entitlement e ON e.id = g.entitlement_id AND e.organization_id = g.organization_id WHERE g.addon_id = a.id AND g.organization_id = a.organization_id AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM addon_price p JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id WHERE p.addon_id = a.id AND p.organization_id = a.organization_id AND e.type = 'NUMBER_AI_CREDIT')
 ))::boolean;

-- name: AddonFamilyHasAI :one
SELECT EXISTS (
 SELECT 1 FROM addon a JOIN addon_family f ON f.id = a.family_id AND f.organization_id = a.organization_id
 WHERE a.organization_id = sqlc.arg(organization_id)
 AND (sqlc.narg(family_id)::uuid IS NULL OR f.id = sqlc.narg(family_id)::uuid)
 AND (sqlc.narg(family_slug)::text IS NULL OR f.slug = sqlc.narg(family_slug)::text)
 AND (
 EXISTS(SELECT 1 FROM addon_entitlement g JOIN entitlement e ON e.id = g.entitlement_id AND e.organization_id = g.organization_id WHERE g.addon_id = a.id AND g.organization_id = a.organization_id AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM addon_price p JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id WHERE p.addon_id = a.id AND p.organization_id = a.organization_id AND e.type = 'NUMBER_AI_CREDIT')
 ))::boolean;
