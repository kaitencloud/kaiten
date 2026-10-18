package reportentitlementusagemetric

import (
	"errors"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// numberKind is the numeric report: fold the value into the counter, gate
// the result against the grant, and emit the crossings it caused.
type numberKind struct{}

func (numberKind) plan(st *State, cmd *Command) (*Effect, error) {
	before := st.Resolution.Current
	after, err := usage.Fold(before, cmd.Value, cmd.Behavior, st.AggregationMethod)
	switch {
	case errors.Is(err, usage.ErrUnknownBehavior):
		return nil, kaitenerrors.Validation("ReportEntitlementUsageMetric.InvalidBehavior", err.Error())
	case errors.Is(err, usage.ErrInvalidAggregation):
		return nil, kaitenerrors.Validation("ReportEntitlementUsageMetric.InvalidAggregationConfiguration", err.Error())
	case err != nil:
		return nil, err
	}

	eff := &Effect{}
	eff.rollover(st)

	report := InstanceEntitlementUsageReportAccepted{
		EntitlementSlug: st.Pair.EntitlementSlug,
		Value:           cmd.Value,
		Behavior:        cmd.Behavior,
		EventCount:      after.EventCount,
	}

	if !usage.Gate(st.Limit, after.Value, 0) {
		report.Status = events.UsageReportStatusRejected
		eff.emit(events.EntitlementUsageReportRejected, report)
		eff.Refusal = kaitenerrors.Conflict("ReportEntitlementUsageMetric.ThresholdExceeded",
			fmt.Sprintf("Usage for %s exceeds the allowed threshold", st.Pair.EntitlementSlug))
		return eff, nil
	}

	// From here the report is accepted: within the cap, or a soft limit
	// admitting an overage within its bound. Usage is always persisted,
	// overage included.
	eff.Counter = &after
	eff.Accepted = true
	eff.ReportedValue = cmd.Value
	eff.Behavior = cmd.Behavior
	report.Status = events.UsageReportStatusAccepted
	eff.emit(events.EntitlementUsageReportAccepted, report)

	response, err := usage.Present(st.gauge(after))
	if err != nil {
		return nil, err
	}
	eff.Response = response
	eff.crossings(st, st.Pair.WarningThresholdPercent, before.Value, after.Value, response)
	return eff, nil
}
