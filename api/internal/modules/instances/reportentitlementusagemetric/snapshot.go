package reportentitlementusagemetric

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Snapshot is an absolute usage counter written outside the report endpoint,
// by the seeders.
type Snapshot struct {
	OrganizationID  uuid.UUID
	InstanceSlug    string
	EntitlementSlug string
	Value           float64
	EventCount      int32
}

// WriteSnapshot sets a pair's counter to s.Value with s.EventCount events and
// journals it as one set report, in one transaction under the pair's lock:
// report_seq moves forward by one and the row starts from the counter it
// replaces, so the journal explains the counter exactly as if the value had
// been reported. A counter written without its journal row would leave the
// journal unable to explain it, which is why seeders write usage through here
// rather than through the bare upsert.
//
// It applies no threshold, and when the stored row belongs to an older window
// it starts the current one without emitting the rollover events a report
// would: a seeder states the counter outright.
func WriteSnapshot(ctx context.Context, uof *uow.UnitOfWork, s Snapshot) error {
	queryRepo := NewQueryRepository(uof)
	commandRepo := NewCommandRepository(uof)

	return uof.Transact(ctx, func(ctx context.Context) error {
		usageCtx, err := queryRepo.GetEntitlementUsageContext(ctx, s.InstanceSlug, s.EntitlementSlug, s.OrganizationID)
		if err != nil {
			return err
		}
		reportedAt := usageCtx.ReportedAt

		stored := entitlementvalue.NewDefaultNumberUsageValue()
		if usageCtx.UsageValue != nil {
			stored, err = entitlementvalue.ParseNumberUsageValue(usageCtx.UsageValue)
			if err != nil {
				return kaitenerrors.Validation("ReportEntitlementUsageMetric.InvalidStoredUsageValue", err.Error())
			}
		}
		threshold, err := entitlementvalue.ParseNumberThreshold(usageCtx.EffectiveValue)
		if err != nil {
			return kaitenerrors.Validation("ReportEntitlementUsageMetric.InvalidLicenseEntitlementValue", err.Error())
		}

		valueBefore := stored.Value
		var windowStart, windowEnd *time.Time
		if usageCtx.ResetPeriod != nil {
			window, _, err := period.ResolveCurrent(reportedAt, usageCtx.PeriodStart, *usageCtx.ResetPeriod, *usageCtx.ResetAnchor, usageCtx.LicenseStart)
			if err != nil {
				return err
			}
			windowStart, windowEnd = &window.Start, &window.End
			if usageCtx.PeriodStart == nil || !usageCtx.PeriodStart.Equal(window.Start) {
				valueBefore = 0
			}
		}

		value, err := entitlementvalue.ToBytes(&entitlementvalue.NumberUsageValue{
			Type:       entitlementvalue.TypeNumber,
			Value:      s.Value,
			EventCount: s.EventCount,
		})
		if err != nil {
			return err
		}

		reportSeq, err := commandRepo.AcceptEntitlementUsage(ctx, usageCtx.InstanceID, usageCtx.EntitlementID, value, s.OrganizationID, windowStart)
		if err != nil {
			return err
		}

		return commandRepo.AppendUsageLedger(ctx, LedgerEntry{
			OrganizationID:    s.OrganizationID,
			InstanceID:        usageCtx.InstanceID,
			EntitlementID:     usageCtx.EntitlementID,
			LicenseID:         usageCtx.LicenseID,
			ReportSeq:         reportSeq,
			ReportedAt:        reportedAt,
			WindowStart:       windowStart,
			WindowEnd:         windowEnd,
			Behavior:          BehaviorSet,
			AggregationMethod: resolveAggregationMethod(usageCtx.AggregationMethod),
			ReportedValue:     s.Value,
			ValueBefore:       valueBefore,
			ValueAfter:        s.Value,
			EventCountAfter:   s.EventCount,
			Threshold:         threshold,
			OveragePercent:    usageCtx.LimitCapExceededOveragePercent,
		})
	})
}
