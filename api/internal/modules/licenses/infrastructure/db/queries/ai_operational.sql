-- name: LicenseHasAI :one
SELECT EXISTS (
 SELECT 1 FROM license l WHERE l.organization_id = sqlc.arg(organization_id) AND l.id = sqlc.arg(license_id)
 AND (
 EXISTS(SELECT 1 FROM license_entitlement g JOIN entitlement e ON e.id = g.entitlement_id AND e.organization_id = g.organization_id WHERE g.license_id = l.id AND g.organization_id = l.organization_id AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM license_price p JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id WHERE p.license_id = l.id AND p.organization_id = l.organization_id AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM credit_conversion_rule r WHERE r.license_id = l.id AND r.organization_id = l.organization_id)
 ))::boolean;
