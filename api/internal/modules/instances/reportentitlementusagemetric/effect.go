package reportentitlementusagemetric

import (
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	instanceevents "github.com/kaitencloud/kaiten/api/internal/modules/instances/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
)

// Effect is what a kind decided a report does, before anything is written:
// the counter to store (nil: leave it), the events to emit, and the answer.
// apply executes it; nothing else writes.
type Effect struct {
	Counter *usage.Counter
	Events  []Event
	// Response is the 200 body. Nil when Refusal is set.
	Response *schema.EntitlementUsage
	// Refusal is returned to the caller after the transaction commits, so a
	// refused report still persists what it legitimately wrote -- its own
	// rejected event, and a rollover that has really happened.
	Refusal error
}

// Event is one outbox event an Effect emits, instance-scoped to the pair.
type Event struct {
	Metadata events.Metadata
	Payload  any
}

func (e *Effect) emit(metadata events.Metadata, payload any) {
	e.Events = append(e.Events, Event{Metadata: metadata, Payload: payload})
}

// rollover closes the stale windows the report resolved: one event per
// closure, and the counter reset to zero in the open window. A kind that
// accepts the report overwrites Counter with its own result, so the pair is
// still upserted once.
//
// The reset is persisted independently of what the report decides:
// refusing the report must not undo period maintenance that has already
// legitimately advanced, or the same rollover would be emitted again by the
// next report.
func (e *Effect) rollover(st *State) {
	if !st.Resolution.Stale() {
		return
	}
	for _, c := range st.Resolution.Closures {
		e.emit(instanceevents.InstanceEntitlementUsagePeriodRolledOver, InstanceEntitlementUsagePeriodRolledOver{
			EntitlementID:     st.Pair.EntitlementID,
			EntitlementSlug:   st.Pair.EntitlementSlug,
			InstanceID:        st.Pair.InstanceID,
			Value:             c.Value,
			EventCount:        c.EventCount,
			ClosedPeriodStart: c.ClosedPeriodStart,
			ClosedPeriodEnd:   c.ClosedPeriodEnd,
			NewPeriodStart:    c.NewPeriodStart,
			IsSynthetic:       c.IsSynthetic,
		})
	}
	reset := usage.Zero()
	e.Counter = &reset
}

// crossings emits one event per boundary the counter crossed going from
// before to after. response is the accepted report's answer, which is also
// USAGE_REACHED's payload.
func (e *Effect) crossings(st *State, warningPercent int32, before, after float64, response *schema.EntitlementUsage) {
	for _, c := range usage.Crossings(st.Limit, warningPercent, before, after) {
		switch c.Kind {
		case usage.Reached:
			e.emit(instanceevents.InstanceEntitlementUsageReached, response)
		case usage.CapExceeded:
			e.emit(instanceevents.InstanceEntitlementCapExceeded, InstanceEntitlementCapExceeded{
				EntitlementSlug: st.Pair.EntitlementSlug,
				Threshold:       c.Boundary,
				Value:           after,
				Overage:         after - c.Boundary,
			})
		case usage.Warning:
			e.emit(instanceevents.InstanceEntitlementUsageWarningThresholdReached, InstanceEntitlementUsageWarningThresholdReached{
				EntitlementSlug: st.Pair.EntitlementSlug,
				Threshold:       st.Limit.Threshold,
				Boundary:        c.Boundary,
				Value:           after,
			})
		}
	}
}
