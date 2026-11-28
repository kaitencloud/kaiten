package deleteentitlementresource

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for ctx -- the
// caller's transaction if Transact opened one, the pool otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

// LockPair resolves the slugs to the pair, without checking the grant, and takes
// the pair's advisory lock: the lock every report of any of its resources takes,
// so a delete and a report of the same resource run one after the other.
func (r *CommandRepository) LockPair(ctx context.Context, instanceSlug, entitlementSlug string, organizationID uuid.UUID) (db.GetEntitlementContextBySlugRow, error) {
	queries := r.q(ctx)
	pair, err := queries.GetEntitlementContextBySlug(ctx, db.GetEntitlementContextBySlugParams{
		InstanceSlug:    instanceSlug,
		EntitlementSlug: entitlementSlug,
		OrganizationID:  organizationID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return db.GetEntitlementContextBySlugRow{}, kaitenerrors.NotFoundf(operation+".ContextNotFound",
			"instance %q or entitlement %q not found", instanceSlug, entitlementSlug)
	}
	if err != nil {
		return db.GetEntitlementContextBySlugRow{}, err
	}
	if err := queries.LockEntitlementUsage(ctx, db.LockEntitlementUsageParams{
		InstanceID:    pair.InstanceID,
		EntitlementID: pair.EntitlementID,
	}); err != nil {
		return db.GetEntitlementContextBySlugRow{}, err
	}
	return pair, nil
}

// Delete removes one resource's counter and rewrites the pair's row from the
// counters that are left, and returns the counter it removed, as stored. It
// answers whether there was one: when there was none nothing was written.
func (r *CommandRepository) Delete(ctx context.Context, pair db.GetEntitlementContextBySlugRow, resourceKey string, organizationID uuid.UUID) (value []byte, found bool, err error) {
	queries := r.q(ctx)
	row, err := queries.DeleteEntitlementResourceUsage(ctx, db.DeleteEntitlementResourceUsageParams{
		EntitlementID:  pair.EntitlementID,
		InstanceID:     pair.InstanceID,
		ResourceKey:    resourceKey,
		OrganizationID: organizationID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if err := queries.RefreshEntitlementResourceSummary(ctx, db.RefreshEntitlementResourceSummaryParams{
		EntitlementID: pair.EntitlementID,
		InstanceID:    pair.InstanceID,
	}); err != nil {
		return nil, false, err
	}
	return row.Value, true, nil
}

// Now is the usage clock: the instant the deletion is dated by, read once the
// pair's lock is held, as a report's is.
func (r *CommandRepository) Now(ctx context.Context) (time.Time, error) {
	now, err := r.q(ctx).GetDatabaseNow(ctx)
	if err != nil {
		return time.Time{}, err
	}
	return now.Time.UTC(), nil
}
