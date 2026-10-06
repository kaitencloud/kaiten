-- name: GetBillingSettings :one
-- The organization's billing defaults. No row means every default.
SELECT s.default_collection_method, s.default_days_until_due, s.handoff_stripe_invoices
FROM organization_billing_settings s
WHERE s.organization_id = sqlc.arg(organization_id);


-- name: UpsertBillingSettings :one
INSERT INTO organization_billing_settings (organization_id, default_collection_method, default_days_until_due,
                                           handoff_stripe_invoices, created_by_id, updated_by_id)
VALUES (sqlc.arg(organization_id), sqlc.arg(default_collection_method), sqlc.arg(default_days_until_due),
        sqlc.arg(handoff_stripe_invoices), sqlc.arg(user_id), sqlc.arg(user_id))
ON CONFLICT (organization_id) DO UPDATE
  SET default_collection_method = EXCLUDED.default_collection_method,
      default_days_until_due    = EXCLUDED.default_days_until_due,
      handoff_stripe_invoices   = EXCLUDED.handoff_stripe_invoices,
      updated_by_id             = EXCLUDED.updated_by_id,
      updated_at                = now()
RETURNING default_collection_method, default_days_until_due, handoff_stripe_invoices;
