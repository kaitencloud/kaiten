package reportentitlementusagemetric

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/effectivelookup"
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
	// Basis is what the pair's windows are phased off: the licence start,
	// and the subscription a BILLING_PERIOD window follows. LoadLimits reads
	// it under the pair's lock with the reset settings (§6.7 rule 5).
	Basis period.Basis
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
	// LicenseEntitlementID and Provenance are the same row's: whether the
	// licence grants the entitlement, and what each layer contributes. The
	// report answers them as source and provenance (V31-55).
	LicenseEntitlementID *uuid.UUID
	Provenance           []byte
	// Source is the layer that makes the row exist: license, addon or
	// exception (§7.5).
	Source string
	// OveragePercent is LimitCapExceededOveragePercent as the view's SMALLINT
	// holds it, for the answer.
	OveragePercent int16
	LicenseSlug    *string
	UsageValue     []byte     // nil when no usage row exists yet
	PeriodStart    *time.Time // nil for a lifetime bucket, or when no usage row exists yet
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

// contextNotFound is the answer for a pair that does not resolve, or that
// nothing grants at the report's instant.
func contextNotFound(instanceSlug, entitlementSlug string) error {
	return kaitenerrors.NotFound(
		"ReportEntitlementUsageMetric.ContextNotFound",
		fmt.Sprintf("instance %q or entitlement %q not found, or entitlement is not licensed for this instance", instanceSlug, entitlementSlug),
	)
}

// LockPair runs steps 2 to 4 of §6.1: it resolves the slugs to the pair,
// without checking the grant, locks the pair, and stamps the instant the
// report is dated by. The replay lookup runs next, before LoadLimits checks
// the grant (V31-29): a replay needs the pair to be granted no longer.
//  1. GetEntitlementContextBySlug — resolves instance/entitlement slugs.
//  2. LockEntitlementUsage — serializes every report for the resolved pair, including the
//     first report before an entitlement_usage row exists.
//  3. StampReportInstant — reads the clock the report is dated by, now that the lock is
//     held, and makes it the instant the effective entitlement is evaluated at.
func (r *QueryRepository) LockPair(ctx context.Context, instanceSlug, entitlementSlug string, organizationID uuid.UUID) (*UsageContext, error) {
	queries := r.q(ctx)

	ctx1, err := queries.GetEntitlementContextBySlug(ctx, db.GetEntitlementContextBySlugParams{
		InstanceSlug:    instanceSlug,
		EntitlementSlug: entitlementSlug,
		OrganizationID:  organizationID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, contextNotFound(instanceSlug, entitlementSlug)
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

	return &UsageContext{
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
		EffectiveValue:                 nil,
		LimitCapExceededOveragePercent: 0,
		LicenseEntitlementID:           nil,
		Provenance:                     nil,
		Source:                         "",
		OveragePercent:                 0,
		LicenseSlug:                    ctx1.LicenseSlug,
		UsageValue:                     nil,
		PeriodStart:                    nil,
	}, nil
}

// LoadLimits runs step 6 of §6.1 on a pair LockPair locked: the effective
// limit and overage policy at the report's instant -- none, the pair is not
// granted at that instant, answers 404 .ContextNotFound -- then the counter
// row, locked, when there is one. The limit is read under the lock rather
// than with the slugs, so the report is gated on its entitlement as of the
// instant it is dated by.
func (r *QueryRepository) LoadLimits(ctx context.Context, result *UsageContext, instanceSlug, entitlementSlug string, organizationID uuid.UUID) error {
	queries := r.q(ctx)
	done := effectivelookup.Time(ctx, effectivelookup.ReaderGate)
	limit, err := queries.GetEffectiveEntitlementLimit(ctx, db.GetEffectiveEntitlementLimitParams{
		InstanceID:     result.InstanceID,
		EntitlementID:  result.EntitlementID,
		OrganizationID: organizationID,
	})
	done()
	if errors.Is(err, pgx.ErrNoRows) {
		return contextNotFound(instanceSlug, entitlementSlug)
	}
	if err != nil {
		return err
	}
	result.EffectiveValue = limit.Value
	result.LicenseEntitlementID, result.Provenance, result.Source = limit.LicenseEntitlementID, limit.Provenance, limit.Source
	// The version the limit was read under, not the one the slugs resolved to
	// before the lock: a licence change may have committed in between.
	result.LicenseID, result.LicenseSlug = limit.LicenseID, limit.LicenseSlug
	// So is the window configuration: a report computing its window from
	// facts read before the lock could reopen a window of the old
	// configuration over one a concurrent report already moved (§6.7 rule 5).
	result.ResetPeriod, result.ResetAnchor = nil, nil
	if limit.ResetPeriod != nil && limit.ResetAnchor != nil {
		resetPeriod, resetAnchor := period.ResetPeriod(*limit.ResetPeriod), period.ResetAnchor(*limit.ResetAnchor)
		result.ResetPeriod, result.ResetAnchor = &resetPeriod, &resetAnchor
	}
	result.LicenseStart = limit.StartLicenseDate.Time.UTC()
	result.Basis = period.NewBasis(result.LicenseStart, limit.BillingStatus,
		pgtime.PgTimeStampToTimePtr(limit.BillingAnchorAt), pgtime.PgTimeStampToTimePtr(limit.LiveEndedAt))
	if limit.LimitCapExceededOveragePercent != nil {
		result.OveragePercent = *limit.LimitCapExceededOveragePercent
		result.LimitCapExceededOveragePercent = int32(result.OveragePercent)
	}

	// Lock the usage row if it exists. ErrNoRows means first report — leave UsageValue nil.
	usage, err := queries.GetEntitlementUsageContext(ctx, db.GetEntitlementUsageContextParams{
		InstanceID:     result.InstanceID,
		EntitlementID:  result.EntitlementID,
		OrganizationID: organizationID,
	})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if err == nil {
		result.UsageValue = usage.Value
		if usage.PeriodStart.Valid {
			periodStart := usage.PeriodStart.Time.UTC()
			result.PeriodStart = &periodStart
		}
	}
	return nil
}
