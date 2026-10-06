package reportentitlementusagemetric

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// UsageContext combines slug-resolved metadata with what the report reads under
// the pair's lock: the instant it is dated by, the effective limit at that
// instant and the current (possibly absent) usage value. It is the single
// result type returned by QueryRepository.GetEntitlementUsageContext.
type UsageContext struct {
	InstanceID              uuid.UUID
	LicenseID               uuid.UUID
	LicenseStart            time.Time
	EntitlementID           uuid.UUID
	EntitlementSlug         string
	EntitlementType         db.EntitlementType
	AggregationMethod       *db.AggregationMethod
	WarningThresholdPercent int32
	ResetPeriod             *period.ResetPeriod
	ResetAnchor             *period.ResetAnchor
	// ReportedAt is the instant the report is dated by: the usage clock, read
	// once the pair's lock is held.
	ReportedAt time.Time
	// EffectiveValue is the instance's effective entitlement at ReportedAt
	// (instance_effective_entitlement): the limit the report is gated on.
	EffectiveValue []byte
	// LimitCapExceededOveragePercent is the effective overage policy at
	// ReportedAt: -1 when EffectiveValue is unlimited, 0 for a hard limit, or a
	// positive percentage for a soft limit. Guaranteed non-nil by the schema
	// for any NUMBER-family entitlement, the only type this package handles.
	LimitCapExceededOveragePercent int32
	LicenseSlug                    *string
	UsageValue                     []byte     // nil when no usage row exists yet
	PeriodStart                    *time.Time // nil for a lifetime bucket, or when no usage row exists yet
}

type QueryRepository struct {
	uof *uow.UnitOfWork
}

func NewQueryRepository(uof *uow.UnitOfWork) *QueryRepository {
	return &QueryRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *QueryRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

// GetEntitlementUsageContext resolves slugs and retrieves what the report is
// decided on:
//  1. GetEntitlementContextBySlug — resolves instance/entitlement slugs and checks the
//     instance is granted the entitlement (4 queries replaced with 1, no FOR UPDATE needed here).
//  2. LockEntitlementUsage — serializes every report for the resolved pair, including the
//     first report before an entitlement_usage row exists.
//  3. StampReportInstant — reads the clock the report is dated by, now that the lock is
//     held, and makes it the instant the effective entitlement is evaluated at.
//  4. GetEffectiveEntitlementLimit — the limit and overage policy at that instant.
//  5. GetEntitlementUsageContext — locks and reads the existing usage row if present.
//
// The limit is read under the lock rather than with the slugs, so the report is
// gated on its entitlement as of the instant it is dated by.
func (r *QueryRepository) GetEntitlementUsageContext(ctx context.Context, instanceSlug, entitlementSlug string, organizationID uuid.UUID) (*UsageContext, error) {
	queries := r.q(ctx)

	ctx1, err := queries.GetEntitlementContextBySlug(ctx, db.GetEntitlementContextBySlugParams{
		InstanceSlug:    instanceSlug,
		EntitlementSlug: entitlementSlug,
		OrganizationID:  organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound(
				"ReportEntitlementUsageMetric.ContextNotFound",
				fmt.Sprintf("instance %q or entitlement %q not found, or entitlement is not licensed for this instance", instanceSlug, entitlementSlug),
			)
		}
		return nil, err
	}

	if err := queries.LockEntitlementUsage(ctx, db.LockEntitlementUsageParams{
		InstanceID:    ctx1.InstanceID,
		EntitlementID: ctx1.EntitlementID,
	}); err != nil {
		return nil, fmt.Errorf("lock entitlement usage: %w", err)
	}

	var resetPeriod *period.ResetPeriod
	if ctx1.ResetPeriod != nil {
		rp := period.ResetPeriod(*ctx1.ResetPeriod)
		resetPeriod = &rp
	}
	var resetAnchor *period.ResetAnchor
	if ctx1.ResetAnchor != nil {
		ra := period.ResetAnchor(*ctx1.ResetAnchor)
		resetAnchor = &ra
	}

	// The instant the report is dated by: the database clock, read once and
	// only now that the pair's lock is held. now() would be the transaction's
	// BEGIN, so a report that waited for the lock across a window boundary
	// would compute the window it began in rather than the one the report
	// before it already rolled over to.
	stamp, err := queries.StampReportInstant(ctx)
	if err != nil {
		return nil, fmt.Errorf("read the report instant: %w", err)
	}

	limit, err := queries.GetEffectiveEntitlementLimit(ctx, db.GetEffectiveEntitlementLimitParams{
		InstanceID:     ctx1.InstanceID,
		EntitlementID:  ctx1.EntitlementID,
		OrganizationID: organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// The grant went away between the slug lookup and the lock: a
			// licence change committed in between.
			return nil, kaitenerrors.NotFound(
				"ReportEntitlementUsageMetric.ContextNotFound",
				fmt.Sprintf("instance %q or entitlement %q not found, or entitlement is not licensed for this instance", instanceSlug, entitlementSlug),
			)
		}
		return nil, err
	}
	var limitCapExceededOveragePercent int32
	if limit.LimitCapExceededOveragePercent != nil {
		limitCapExceededOveragePercent = int32(*limit.LimitCapExceededOveragePercent)
	}

	result := &UsageContext{
		InstanceID:                     ctx1.InstanceID,
		LicenseID:                      ctx1.LicenseID,
		LicenseStart:                   ctx1.StartLicenseDate.Time.UTC(),
		EntitlementID:                  ctx1.EntitlementID,
		EntitlementSlug:                ctx1.EntitlementSlug,
		EntitlementType:                ctx1.EntitlementType,
		AggregationMethod:              ctx1.AggregationMethod,
		WarningThresholdPercent:        int32(ctx1.WarningThresholdPercent),
		ResetPeriod:                    resetPeriod,
		ResetAnchor:                    resetAnchor,
		ReportedAt:                     stamp.Now.Time.UTC(),
		EffectiveValue:                 limit.Value,
		LimitCapExceededOveragePercent: limitCapExceededOveragePercent,
		LicenseSlug:                    ctx1.LicenseSlug,
	}

	// Lock the usage row if it exists. ErrNoRows means first report — leave UsageValue nil.
	usage, err := queries.GetEntitlementUsageContext(ctx, db.GetEntitlementUsageContextParams{
		InstanceID:     ctx1.InstanceID,
		EntitlementID:  ctx1.EntitlementID,
		OrganizationID: organizationID,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if err == nil {
		result.UsageValue = usage.Value
		if usage.PeriodStart.Valid {
			periodStart := usage.PeriodStart.Time.UTC()
			result.PeriodStart = &periodStart
		}
	}

	return result, nil
}
