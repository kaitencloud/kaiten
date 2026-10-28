package reportentitlementusagemetric

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
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
		if eff.Accepted {
			seq, err := h.commandRepo.AcceptEntitlementUsage(ctx, st.Pair.InstanceID, st.Pair.EntitlementID, value, st.OrganizationID, st.Resolution.Window.Start)
			if err != nil {
				return err
			}
			err = h.commandRepo.AppendUsageLedger(ctx, LedgerEntry{
				OrganizationID: st.OrganizationID, InstanceID: st.Pair.InstanceID, EntitlementID: st.Pair.EntitlementID, LicenseID: st.Pair.LicenseID,
				ReportSeq: seq, ReportedAt: st.Now, WindowStart: st.Resolution.Window.Start, WindowEnd: st.Resolution.Window.End,
				Behavior: eff.Behavior, AggregationMethod: st.AggregationMethod, ReportedValue: eff.ReportedValue,
				ValueBefore: st.Resolution.Current.Value, ValueAfter: eff.Counter.Value, EventCountAfter: eff.Counter.EventCount,
				Threshold: st.Limit.Threshold, OveragePercent: st.Limit.OveragePercent, TransactionID: st.TransactionID, Properties: st.Properties,
			})
			if err != nil {
				if kaitenerrors.IsMissingPartition(err, usageLedgerTable) {
					h.ledgerUnavailable.Add(ctx, 1)
					return kaitenerrors.Unavailable("ReportEntitlementUsageMetric.LedgerUnavailable", "the usage journal cannot record a report at this instant; nothing was counted, retry later")
				}
				return err
			}
		} else if err := h.commandRepo.ReportEntitlementUsage(ctx, st.Pair.InstanceID, st.Pair.EntitlementID, value, st.OrganizationID, st.Resolution.Window.Start); err != nil {
			return err
		}

	}

	if err := h.applyAI(ctx, eff); err != nil {
		return err
	}
	messages := make([]outbox.Outbox, len(eff.Events))
	for i, e := range eff.Events {
		messages[i] = outbox.NewOutboxMessage(
			st.OrganizationID, e.Metadata.Name, e.Metadata.Type, e.Payload,
			outbox.AuditHeaders{InstanceID: &st.Pair.InstanceID},
		).At(st.Now)
	}
	return h.outbox.CreateOutboxEvents(ctx, messages)
}
