-- +goose Up
-- +goose StatementBegin
-- A refund tied to the inference it corrects. The counter movement itself is
-- an ordinary negative report -- a usage_ledger row, a report_seq, the
-- report's own events -- written by the report's shared write step. This
-- table only records the link: which inference the refund corrects, how much
-- of its charge it gives back, why, who asked and under which key.
--
-- Append-only: a refund is never edited or deleted, and ai_inference is not
-- touched. What is left to refund is credits_charged minus the sum of the
-- inference's rows here, read under the pair's lock.
--
-- inference_id is the ai_inference row; transaction_id is copied from it so
-- the link stays readable on its own. Like every other reference on the AI
-- evidence tables, neither they nor created_by_id carry a foreign key: the
-- record outlives what it points at. refund_key is the Idempotency-Key the
-- refund was accepted under, unique for the pair without a time bound (a
-- refund retried months later must not refund twice), and request_hash is
-- what a replay is compared with. report_seq is the journal row of the
-- movement. created_at is the instant the report was dated by.
CREATE TABLE "ai_inference_refund"
(
  "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID           NOT NULL,
  "instance_id"     UUID           NOT NULL,
  "entitlement_id"  UUID           NOT NULL,
  "inference_id"    UUID           NOT NULL,
  "transaction_id"  TEXT           NOT NULL,
  "refund_key"      TEXT           NOT NULL,
  "request_hash"    BYTEA          NOT NULL,
  "credits"         NUMERIC(38, 6) NOT NULL,
  "reason"          TEXT,
  "report_seq"      BIGINT         NOT NULL,
  "created_at"      TIMESTAMP(3)   NOT NULL,
  "created_by_id"   UUID           NOT NULL,

  CONSTRAINT "ai_inference_refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_inference_refund_pair_key_key" UNIQUE ("instance_id", "entitlement_id", "refund_key"),
  CONSTRAINT "ai_inference_refund_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_inference_refund_credits_check" CHECK ("credits" > 0),
  CONSTRAINT "ai_inference_refund_reason_check" CHECK ("reason" IS NULL OR char_length("reason") BETWEEN 1 AND 500),
  CONSTRAINT "ai_inference_refund_hash_check" CHECK (octet_length("request_hash") = 32),
  CONSTRAINT "ai_inference_refund_report_seq_check" CHECK ("report_seq" >= 0)
);

-- The refunds of an inference, oldest first: the sum under the pair's lock,
-- and the read of a page of inferences.
CREATE INDEX "idx_ai_inference_refund_inference" ON "ai_inference_refund" ("inference_id", "created_at", "id");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "ai_inference_refund";
-- +goose StatementEnd
