package reportentitlementusagemetric

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage/aicredit"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// State is everything a report decides on, read once, under the pair's
// advisory lock, at the start of the report's transaction. Nothing a kind
// plans reads the database again.
type State struct {
	Reserved            decimal.Decimal
	ReservationTTL      time.Duration
	Operation           *db.AiInference
	AIHash              []byte
	Replay              *schema.EntitlementUsage
	AIModel             *aicredit.Model
	AIModelRef          string
	AIRequestType       aicredit.RequestType
	AIRules             []aicredit.Rule
	UnauthorizedAlready bool
	OrganizationID      uuid.UUID
	Pair                *UsageContext
	// Now is the report's one clock read, taken after the lock: the instant
	// every window decision of this report is made against.
	Now               time.Time
	Limit             usage.Limit
	AggregationMethod string
	Resolution        usage.Resolution
	Properties        []byte
	TransactionID     *string
}

// load takes the pair's lock and reads its state. It refuses an entitlement
// whose type no report kind handles before reading anything else.
func (h *UseCase) load(ctx context.Context, organizationID uuid.UUID, instanceSlug, entitlementSlug string) (*State, error) {
	pair, err := h.queryRepo.LockPair(ctx, instanceSlug, entitlementSlug, organizationID)
	if err != nil {
		return nil, err
	}

	if pair.EntitlementType != db.EntitlementTypeNUMBER && pair.EntitlementType != db.EntitlementTypeNUMBERAICREDIT {
		return nil, kaitenerrors.Validation(
			"ReportEntitlementUsageMetric.UnsupportedEntitlementType",
			"report usage is only supported for NUMBER and NUMBER_AI_CREDIT entitlements",
		)
	}

	aggregationMethod := usage.DefaultAggregationMethod
	if pair.AggregationMethod != nil {
		aggregationMethod = string(*pair.AggregationMethod)
	}

	return &State{
		OrganizationID: organizationID,
		Pair:           pair,
		Now:            pair.ReportedAt,

		AggregationMethod: aggregationMethod,
	}, nil
}

// gauge is the pair's usage at counter, in the window this report resolved.
func (s *State) gauge(counter usage.Counter) usage.Gauge {
	licenseSlug := ""
	if s.Pair.LicenseSlug != nil {
		licenseSlug = *s.Pair.LicenseSlug
	}
	return usage.Gauge{
		EntitlementID:   s.Pair.EntitlementID,
		EntitlementSlug: s.Pair.EntitlementSlug,
		LicenseID:       s.Pair.LicenseID,
		LicenseSlug:     licenseSlug,
		NumberFamily:    true,
		OveragePercent:  &s.Pair.OveragePercent,
		Source:          s.Pair.Source,
		Provenance:      s.Pair.Provenance,
		LicenseValue:    s.Pair.EffectiveValue,
		Counter:         counter,
		Window:          s.Resolution.Window,
	}
}

func (h *UseCase) resolveState(ctx context.Context, st *State) error {
	pair := st.Pair
	stored := usage.Stored{Present: pair.UsageValue != nil, PeriodStart: pair.PeriodStart}
	if stored.Present {
		value, err := entitlementvalue.ParseNumberUsageValue(pair.UsageValue)
		if err != nil {
			return kaitenerrors.Validation("ReportEntitlementUsageMetric.InvalidStoredUsageValue", err.Error())
		}
		stored.Counter = usage.Counter{Value: value.Value, EventCount: value.EventCount}
	}

	threshold, err := entitlementvalue.ParseNumberThreshold(pair.EffectiveValue)
	if err != nil {
		return kaitenerrors.Validation("ReportEntitlementUsageMetric.InvalidLicenseEntitlementValue", err.Error())
	}

	now := pair.ReportedAt

	resolution, err := usage.ResolveWithLimit(ctx, h.maxRolloverClosures, now, usage.PeriodicityOn(pair.ResetPeriod, pair.ResetAnchor, pair.Basis), stored)
	if err != nil {
		return err
	}

	st.Limit = usage.Limit{Threshold: threshold, OveragePercent: pair.LimitCapExceededOveragePercent}
	st.Resolution = resolution
	return nil
}
