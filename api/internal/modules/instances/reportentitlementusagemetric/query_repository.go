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

// UsageContext combines slug-resolved metadata with the current (possibly absent) usage value.
// It is the single result type returned by QueryRepository.GetEntitlementUsageContext.
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
	LicenseEntitlementValue []byte
	// LimitCapExceededOveragePercent is the license grant's own overage
	// policy (see licenses' license_entitlement.limit_cap_exceeded_overage_percent):
	// -1 when LicenseEntitlementValue is unlimited, 0 for a hard limit, or a
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

// GetEntitlementUsageContext resolves slugs and retrieves current usage:
//  1. GetEntitlementContextBySlug — resolves instance/entitlement slugs and validates the
//     license entitlement (4 queries replaced with 1, no FOR UPDATE needed here).
//  2. LockEntitlementUsage — serializes every report for the resolved pair, including the
//     first report before an entitlement_usage row exists.
//  3. GetEntitlementUsageContext — locks and reads the existing usage row if present.
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

	var limitCapExceededOveragePercent int32
	if ctx1.LimitCapExceededOveragePercent != nil {
		limitCapExceededOveragePercent = int32(*ctx1.LimitCapExceededOveragePercent)
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
		LicenseEntitlementValue:        ctx1.LicenseEntitlementValue,
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

// GetDatabaseNow returns the database's current time (UTC), converted at
// the database rather than the application node -- the single time source
// for periodic usage window decisions, so reads/reports across
// replicas stay aligned.
func (r *QueryRepository) GetDatabaseNow(ctx context.Context) (time.Time, error) {
	now, err := r.q(ctx).GetDatabaseNow(ctx)
	if err != nil {
		return time.Time{}, err
	}
	return now.Time.UTC(), nil
}
