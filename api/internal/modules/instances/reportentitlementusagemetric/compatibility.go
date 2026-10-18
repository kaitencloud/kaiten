package reportentitlementusagemetric

import (
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

func computeUpdatedUsage(command *Command, current *entitlementvalue.NumberUsageValue, aggregationMethod string) (*entitlementvalue.NumberUsageValue, error) {
	switch command.Behavior {
	case BehaviorSet:
		// EventCount is 1, not 0: a set IS one reported observation of the
		// counter, and the pair {value, eventCount} has to stay coherent --
		// {60, 0} would claim a value nothing produced. It is also what makes
		// a following AVERAGE append correct, since averageAppendStrategy
		// folds on the stored count: ((60*1)+40)/2 = 50, the average of the
		// two observations. With 0 it would compute ((60*0)+40)/1 = 40 and
		// the value just set would vanish from the average.
		//
		// Note this is not the "cannot correct downward" path: a set writes
		// the ABSOLUTE value, so correcting 60 down to 25 under a cap of 30
		// is compared as 25 > 30 and accepted. Only a set that lands ABOVE
		// the cap is rejected, and only under HARD enforcement.
		return &entitlementvalue.NumberUsageValue{
			Type:       entitlementvalue.TypeNumber,
			Value:      command.Value,
			EventCount: 1,
		}, nil

	case BehaviorAppend:
		strategy, err := usage.SelectAppendStrategy(aggregationMethod)
		if err != nil {
			return nil, kaitenerrors.Validation("ReportEntitlementUsageMetric.InvalidAggregationConfiguration", err.Error())
		}
		return &entitlementvalue.NumberUsageValue{
			Type:       entitlementvalue.TypeNumber,
			Value:      strategy.Apply(current.Value, command.Value, current.EventCount),
			EventCount: current.EventCount + 1,
		}, nil

	default:
		return nil, kaitenerrors.Validation(
			"ReportEntitlementUsageMetric.InvalidBehavior",
			"behavior must be one of: append, set",
		)
	}
}

// resolveAggregationMethod defaults to SUM: entitlements created before
// aggregationMethod became mandatory for NUMBER entitlements may still have
// it unset, and SUM preserves the original CALCULATED_USAGE behavior.
func resolveAggregationMethod(aggregationMethod *db.AggregationMethod) string {
	if aggregationMethod == nil {
		return string(db.AggregationMethodSUM)
	}
	return string(*aggregationMethod)
}
