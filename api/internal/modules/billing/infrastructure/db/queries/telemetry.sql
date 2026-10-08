-- name: BillingGauges :one
-- The deployment-wide gauges of §19.1, read at each metrics collection:
-- what is late, owed or about to stop working, over every organization.
SELECT
  (SELECT count(*) FROM instance_billing b
    WHERE b.status IN ('TRIAL', 'ACTIVE', 'PAST_DUE')
      AND b.current_period_end <= sqlc.arg(close_before)::timestamp)::bigint AS close_backlog,
  (SELECT count(*) FROM instance_billing b WHERE b.status = 'PAST_DUE')::bigint AS past_due,
  (SELECT min(i.issued_at) FROM instance_invoice i WHERE i.handoff_status = 'PENDING')::timestamp AS oldest_pending_issued_at,
  (SELECT count(*) FROM customer_billing c
    WHERE c.payment_method_status = 'ACTIVE'
      AND c.payment_method_exp_year IS NOT NULL AND c.payment_method_exp_month IS NOT NULL
      AND make_date(c.payment_method_exp_year, c.payment_method_exp_month, 1) + interval '1 month' > sqlc.arg(now)::timestamp
      AND make_date(c.payment_method_exp_year, c.payment_method_exp_month, 1) + interval '1 month'
          <= sqlc.arg(now)::timestamp + interval '30 days')::bigint AS payment_methods_expiring;


-- name: OldestProviderSync :many
-- Per provider, the least recent sync of any organization: its lag is the
-- sync lag the alert watches.
SELECT provider_kind, min(last_synced_at)::timestamp AS oldest_synced_at
FROM billing_sync_state
WHERE last_synced_at IS NOT NULL
GROUP BY provider_kind;
