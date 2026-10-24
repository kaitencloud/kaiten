package reportentitlementusagemetric

import "github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"

// resolveAggregationMethod defaults to SUM: entitlements created before
// aggregationMethod became mandatory for NUMBER entitlements may still have
// it unset, and SUM preserves the original CALCULATED_USAGE behavior.
func resolveAggregationMethod(aggregationMethod *db.AggregationMethod) string {
	if aggregationMethod == nil {
		return string(db.AggregationMethodSUM)
	}
	return string(*aggregationMethod)
}
