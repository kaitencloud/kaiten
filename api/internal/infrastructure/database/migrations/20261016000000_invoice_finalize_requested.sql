-- +goose Up
-- +goose StatementBegin
-- instance_invoice.finalize_requested: a retry-push that asked for the
-- finalization of a review-mode draft (§12.4). It is read by the push that
-- runs the invoice, whichever started it: a retry-push answered while a push
-- was under way would otherwise be lost -- the requeue overwrote that push's
-- lease, then the push left the draft waiting for review and cleared the
-- queue's date.
ALTER TABLE "instance_invoice" ADD COLUMN "finalize_requested" boolean NOT NULL DEFAULT false;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "instance_invoice" DROP COLUMN "finalize_requested";
-- +goose StatementEnd
