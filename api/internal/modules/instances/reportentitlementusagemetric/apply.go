package reportentitlementusagemetric

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
)

// apply is the one impure step of a report: the pair's single counter
// upsert, then every event of the effect in one round trip. Whatever every
// report has to do when it writes -- a journal row, a sequence number --
// belongs here, right after the upsert, so every kind inherits it.
//
// Outbox rows go through CreateOutboxEvents in one batch regardless of how
// many windows a rollover closed: a dormant HOUR/DAY entitlement can produce
// thousands of closures in one report, and inserting them one at a time
// would hold the advisory lock and this transaction open far longer.
func (h *UseCase) apply(ctx context.Context, st *State, eff *Effect) error {
	if eff.Counter != nil {
		value, err := entitlementvalue.ToBytes(entitlementvalue.NumberUsageValue{
			Type:       entitlementvalue.TypeNumber,
			Value:      eff.Counter.Value,
			EventCount: eff.Counter.EventCount,
		})
		if err != nil {
			return err
		}
		if err := h.commandRepo.ReportEntitlementUsage(
			ctx, st.Pair.InstanceID, st.Pair.EntitlementID, value, st.OrganizationID, st.Resolution.Window.Start,
		); err != nil {
			return err
		}
	}

	messages := make([]outbox.Outbox, len(eff.Events))
	for i, e := range eff.Events {
		messages[i] = outbox.NewOutboxMessage(
			st.OrganizationID, e.Metadata.Name, e.Metadata.Type, e.Payload,
			outbox.AuditHeaders{InstanceID: &st.Pair.InstanceID},
		)
	}
	return h.outbox.CreateOutboxEvents(ctx, messages)
}
