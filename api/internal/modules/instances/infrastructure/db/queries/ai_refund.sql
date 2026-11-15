-- name: GetAIInferenceRefundByKey :one
-- The refund the pair accepted under this key, whenever that was: a key is
-- remembered for as long as the refund is, unlike a report's.
SELECT sqlc.embed(r), u.name AS created_by_name FROM ai_inference_refund r
LEFT JOIN "user" u ON u.id = r.created_by_id
WHERE r.organization_id = sqlc.arg(organization_id) AND r.instance_id = sqlc.arg(instance_id)
AND r.entitlement_id = sqlc.arg(entitlement_id) AND r.refund_key = sqlc.arg(refund_key);

-- name: GetAIInferenceForRefund :one
-- The operation a transactionId names on the pair: the newest one, since an
-- identifier older than the idempotency window may have been used again.
SELECT id, status, credits_charged FROM ai_inference
WHERE organization_id = sqlc.arg(organization_id) AND instance_id = sqlc.arg(instance_id)
AND entitlement_id = sqlc.arg(entitlement_id) AND transaction_id = sqlc.arg(transaction_id)
ORDER BY reported_at DESC, id DESC LIMIT 1;

-- name: SumAIInferenceRefunds :one
-- What the inference has already been refunded, read under the pair's lock.
SELECT COALESCE(SUM(credits), 0)::numeric AS refunded FROM ai_inference_refund
WHERE organization_id = sqlc.arg(organization_id) AND inference_id = sqlc.arg(inference_id);

-- name: InsertAIInferenceRefund :exec
INSERT INTO ai_inference_refund (organization_id, instance_id, entitlement_id, inference_id, transaction_id,
  refund_key, request_hash, credits, reason, report_seq, created_at, created_by_id)
VALUES (sqlc.arg(organization_id), sqlc.arg(instance_id), sqlc.arg(entitlement_id), sqlc.arg(inference_id), sqlc.arg(transaction_id),
  sqlc.arg(refund_key), sqlc.arg(request_hash), sqlc.arg(credits), sqlc.narg(reason), sqlc.arg(report_seq), sqlc.arg(created_at), sqlc.arg(created_by_id));

-- name: ListAIInferenceRefunds :many
-- The refunds of a page of inferences, each inference's oldest first.
SELECT sqlc.embed(r), u.name AS created_by_name FROM ai_inference_refund r
LEFT JOIN "user" u ON u.id = r.created_by_id
WHERE r.organization_id = sqlc.arg(organization_id) AND r.inference_id = ANY(sqlc.arg(inference_ids)::uuid[])
ORDER BY r.inference_id, r.created_at, r.id;
