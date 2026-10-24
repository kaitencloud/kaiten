package closing

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/lifecycle"
)

// lockID elects the replica that runs a pass: the version of the migration
// that brought subscriptions, by the house convention.
const lockID int64 = 20261007000000

// NewJob is the period-close job: every pass closes up to batchSize due
// subscriptions of every organization, recorded under system:kaiten, then
// checks the held invoices' journals again and releases the sound ones.
//
// The elected connection, which is not one of the pool's (see sweep.PoolPass),
// only holds the election; each subscription closes in its own transaction on
// the pool, and the row locks, not the election, are what keep a concurrent
// close-periods call off the same subscription.
func NewJob(pool *pgxpool.Pool, closer *Closer, cfg sweep.Config, batchSize int) *sweep.Job {
	return sweep.NewPoolPass("billing-period-close", pool, lockID, cfg, func(ctx context.Context) (err error) {
		// Each subscription recovers its own panic; one outside them fails
		// the pass, never the process the job runs in.
		defer func() {
			if r := recover(); r != nil {
				err = fmt.Errorf("%w in the billing-period-close pass: %v", errPanicked, r)
			}
		}()
		report, err := closer.CloseDue(ctx, Scope{OrganizationID: nil, InstanceID: nil}, batchSize, closer.SystemActor)
		if report.Examined > 0 {
			slog.InfoContext(ctx, "billing periods closed", "examined", report.Examined, "closed", report.Closed,
				"held", report.Held, "skipped", report.Skipped, "has_more", report.HasMore)
		}
		if err != nil {
			return err
		}
		released, err := closer.RecheckHeld(ctx, batchSize)
		if released > 0 {
			slog.InfoContext(ctx, "held invoices released", "released", released)
		}
		return err
	})
}

// SystemActor is system:kaiten's membership in the organization, the user a
// close the job makes is recorded under.
func (c *Closer) SystemActor(ctx context.Context, organizationID uuid.UUID) (uuid.UUID, error) {
	return lifecycle.SystemActor(ctx, c.deps.Queries(ctx), organizationID)
}
