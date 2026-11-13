-- name: VoucherAIPriceReferences :many
-- Only explicit relational meter references are classified; never JSON/CEL.
SELECT p.id, false::boolean AS addon
FROM license_price p JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id
WHERE p.organization_id = sqlc.arg(organization_id) AND p.id = ANY(sqlc.arg(license_price_ids)::uuid[]) AND e.type = 'NUMBER_AI_CREDIT'
UNION ALL
SELECT p.id, true::boolean AS addon
FROM addon_price p JOIN entitlement e ON e.id = p.meters_entitlement_id AND e.organization_id = p.organization_id
WHERE p.organization_id = sqlc.arg(organization_id) AND p.id = ANY(sqlc.arg(addon_price_ids)::uuid[]) AND e.type = 'NUMBER_AI_CREDIT';

-- name: DeleteOrdinaryVoucherGrants :exec
DELETE FROM voucher_entitlement_grant g USING entitlement e
WHERE g.organization_id = sqlc.arg(organization_id) AND g.voucher_id = sqlc.arg(voucher_id)
 AND e.id = g.entitlement_id AND e.organization_id = g.organization_id AND e.type <> 'NUMBER_AI_CREDIT';
