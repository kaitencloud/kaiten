package reportentitlementusagemetric

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

// ReportEntitlementUsage upserts the usage row. periodStart is nil for a
// lifetime entitlement (preserves the legacy NULL period_start); for a
// periodic entitlement, callers always pass the window they want this write
// to land in -- the current window when continuing it, or the newly rolled
// over window when initializing it.
func (r *CommandRepository) ReportEntitlementUsage(ctx context.Context, instanceID, entitlementID uuid.UUID, value []byte, organizationID uuid.UUID, periodStart *time.Time) error {
	var pgPeriodStart pgtype.Timestamp
	if periodStart != nil {
		pgPeriodStart = pgtype.Timestamp{Time: *periodStart, Valid: true}
	}

	return r.q(ctx).ReportEntitlementUsage(ctx, db.ReportEntitlementUsageParams{
		InstanceID:     instanceID,
		EntitlementID:  entitlementID,
		Value:          value,
		OrganizationID: organizationID,
		PeriodStart:    pgPeriodStart,
	})
}
