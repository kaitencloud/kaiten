package reportentitlementusagemetric

import (
	"errors"
	"fmt"
	"math"

	"github.com/shopspring/decimal"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// numberKind is the numeric report: fold the value into the counter, gate
// the result against the grant, and emit the crossings it caused.
type numberKind struct{}

func (numberKind) plan(st *State, cmd *Command) (*Effect, error) {
	if st.Pair.EntitlementType == "NUMBER_AI_CREDIT" && cmd.Behavior == BehaviorSet {
		return nil, kaitenerrors.UnprocessableEntity("ReportEntitlementUsageMetric.AiCreditPoolAppendOnly", "credit pools accept append reports only")
	}
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

	refund := st.Pair.EntitlementType == "NUMBER_AI_CREDIT" && cmd.Behavior == BehaviorAppend && cmd.Value < 0
	accepted := usage.Gate(st.Limit, after.Value, 0)
	if st.Pair.EntitlementType == "NUMBER_AI_CREDIT" && !st.Limit.Unlimited() && !math.IsInf(st.Limit.Maximum(), 1) {
		accepted = decimal.NewFromFloat(after.Value).Add(st.Reserved).LessThanOrEqual(decimal.NewFromFloat(st.Limit.Maximum()))
	}
	if !refund && !accepted {
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
	report.Status = events.UsageReportStatusAccepted
	eff.emit(events.EntitlementUsageReportAccepted, report)

	response, err := usage.Present(st.gauge(after))
	if err != nil {
		return nil, err
	}
	if st.Pair.EntitlementType == "NUMBER_AI_CREDIT" {
		reserved := st.Reserved.String()
		response.Reserved = &reserved
	}
	eff.Response = response
	eff.crossings(st, st.Pair.WarningThresholdPercent, before.Value, after.Value, response)
	return eff, nil
}
