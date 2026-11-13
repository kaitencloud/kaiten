-- name: SubscriptionSelectionHasAI :one
-- External admission only. Internal invoice/settlement arithmetic remains raw.
WITH selected_licenses AS (
 SELECT l.id FROM license l WHERE l.organization_id = sqlc.arg(organization_id) AND (
  l.id = sqlc.narg(move_to_license_id)::uuid
  OR l.id = (SELECT p.license_id FROM license_price p WHERE p.organization_id = l.organization_id AND p.id = sqlc.arg(base_price_id))
  OR l.id = (SELECT i.license_id FROM instance i WHERE i.organization_id = l.organization_id AND i.slug = sqlc.arg(instance_slug))
 )
), selected_addons AS (
 SELECT a.id FROM addon a
 WHERE a.organization_id = sqlc.arg(organization_id)
 AND (
  a.slug = ANY(sqlc.arg(addon_slugs)::text[])
  OR EXISTS (
   -- New ACTIVATION also bills eligible add-ons already held by this instance.
   -- Match the raw billing reader's active/scheduled-removal lifetime floor,
   -- without filtering its historical/internal accounting basis.
   SELECT 1 FROM instance_addon held JOIN instance i
    ON i.id = held.instance_id AND i.organization_id = held.organization_id
   WHERE held.organization_id = a.organization_id AND held.addon_id = a.id
    AND i.slug = sqlc.arg(instance_slug)
    AND held.removed_at IS NULL AND COALESCE(held.pending_quantity, held.quantity) > 0
  )
 )
), selected_voucher AS (
 SELECT v.* FROM voucher v WHERE v.organization_id = sqlc.arg(organization_id) AND v.code_normalized = sqlc.narg(voucher_code)::text
)
SELECT (
 EXISTS(SELECT 1 FROM selected_licenses l JOIN license_entitlement g ON g.license_id = l.id JOIN entitlement e ON e.id = g.entitlement_id WHERE g.organization_id = sqlc.arg(organization_id) AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM selected_licenses l JOIN license_price p ON p.license_id = l.id JOIN entitlement e ON e.id = p.meters_entitlement_id WHERE p.organization_id = sqlc.arg(organization_id) AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM selected_licenses l JOIN credit_conversion_rule r ON r.license_id = l.id WHERE r.organization_id = sqlc.arg(organization_id))
 OR EXISTS(SELECT 1 FROM selected_addons a JOIN addon_entitlement g ON g.addon_id = a.id JOIN entitlement e ON e.id = g.entitlement_id WHERE g.organization_id = sqlc.arg(organization_id) AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM selected_addons a JOIN addon_price p ON p.addon_id = a.id JOIN entitlement e ON e.id = p.meters_entitlement_id WHERE p.organization_id = sqlc.arg(organization_id) AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM selected_voucher v JOIN voucher_entitlement_grant g ON g.voucher_id = v.id JOIN entitlement e ON e.id = g.entitlement_id WHERE g.organization_id = sqlc.arg(organization_id) AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM selected_voucher v JOIN license_price p ON p.id = ANY(v.applicable_license_price_ids) JOIN entitlement e ON e.id = p.meters_entitlement_id WHERE p.organization_id = sqlc.arg(organization_id) AND e.type = 'NUMBER_AI_CREDIT')
 OR EXISTS(SELECT 1 FROM selected_voucher v JOIN addon_price p ON p.id = ANY(v.applicable_addon_price_ids) JOIN entitlement e ON e.id = p.meters_entitlement_id WHERE p.organization_id = sqlc.arg(organization_id) AND e.type = 'NUMBER_AI_CREDIT')
)::boolean;
