package closing

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/sweep"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/platformidentity"
)

// lockID elects the replica that runs a pass: the version of the migration
// that brought subscriptions, by the house convention.
const lockID int64 = 20261007000000

// NewJob is the period-close job: every pass closes up to batchSize due
// subscriptions of every organization, recorded under system:kaiten, then
// checks the held invoices' journals again and releases the sound ones.
//
// The elected connection only holds the election; each subscription closes in
// its own transaction on the pool, and the row locks, not the election, are
// what keep a concurrent close-periods call off the same subscription.
func NewJob(pool *pgxpool.Pool, closer *Closer, cfg sweep.Config, batchSize int) *sweep.Job {
	return sweep.New("billing-period-close", pool, lockID, cfg, func(ctx context.Context, _ *pgxpool.Conn) error {
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
	actor, err := c.deps.Queries(ctx).GetSystemActor(ctx, db.GetSystemActorParams{
		OrganizationID: organizationID, ExternalID: platformidentity.ExternalID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, fmt.Errorf("system:kaiten has no membership in organization %s", organizationID)
	}
	return actor, err
}
