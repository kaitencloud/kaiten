-- +goose Up
-- +goose StatementBegin
-- Trials. trialDays is a subscribe parameter per deal, defaulting to
-- license.trial_period_days; the instant the trial ends is stored. During
-- TRIAL the current period IS the trial: [current_period_start,
-- trial_ends_at). At trial_ends_at the period close converts TRIAL -> ACTIVE
-- and issues the ACTIVATION invoice; usage before trial_ends_at is never
-- billed. trial_ends_at stays as history after conversion and is cleared by a
-- resubscribe without a trial.
ALTER TABLE "instance_billing" ADD COLUMN "trial_ends_at" TIMESTAMP(3);
ALTER TABLE "instance_billing"
  ADD CONSTRAINT "instance_billing_trial_check" CHECK (
    "status" <> 'TRIAL' OR ("trial_ends_at" IS NOT NULL AND "current_period_end" = "trial_ends_at")
    );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- A TRIAL row cannot be represented without trial_ends_at; the Down refuses
-- rather than inventing a status for it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "instance_billing" WHERE "status" = 'TRIAL') THEN
    RAISE EXCEPTION 'instance_billing has TRIAL rows; convert or cancel them before rolling back 20261008000000';
  END IF;
END $$;
ALTER TABLE "instance_billing" DROP CONSTRAINT IF EXISTS "instance_billing_trial_check";
ALTER TABLE "instance_billing" DROP COLUMN IF EXISTS "trial_ends_at";
-- +goose StatementEnd
