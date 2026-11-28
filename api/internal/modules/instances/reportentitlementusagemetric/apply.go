package reportentitlementusagemetric

import (
	"context"
	"fmt"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// apply is the one impure step of a report: the counter's single upsert, then
// every event of the effect in one round trip. The counter is the pair's, or the
// resource's when the report names one -- and then the pair's row is rewritten
// from its resources in the same breath, which is where report_seq moves.
// Whatever every report has to do when it writes -- a journal row, a sequence
// number -- belongs here, right after the upsert, so every kind inherits it.
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
			seq, err := h.acceptCounter(ctx, st, value)
			if err != nil {
				return err
			}
			eff.ReportSeq = &seq
			// The AI operation this report counted keeps the journal's
			// sequence number: from an inference to its usage_ledger row, and
			// back. Only a charged commit reaches this point.
			if eff.AIRow != nil {
				eff.AIRow.ReportSeq = &seq
			}
			err = h.commandRepo.AppendUsageLedger(ctx, LedgerEntry{
				OrganizationID: st.OrganizationID, InstanceID: st.Pair.InstanceID, EntitlementID: st.Pair.EntitlementID, LicenseID: st.Pair.LicenseID,
				ReportSeq: seq, ReportedAt: st.Now, WindowStart: st.Resolution.Window.Start, WindowEnd: st.Resolution.Window.End,
				Behavior: eff.Behavior, AggregationMethod: st.AggregationMethod, ReportedValue: eff.ReportedValue,
				ValueBefore: st.Resolution.Current.Value, ValueAfter: eff.Counter.Value, EventCountAfter: eff.Counter.EventCount,
				Threshold: st.Limit.Threshold, OveragePercent: st.Limit.OveragePercent, TransactionID: st.TransactionID, Properties: st.Properties,
				ResourceKey: st.Pair.ResourceKey,
			})
			if err != nil {
				if kaitenerrors.IsMissingPartition(err, usageLedgerTable) {
					h.ledgerUnavailable.Add(ctx, 1)
					return kaitenerrors.Unavailable("ReportEntitlementUsageMetric.LedgerUnavailable", "the usage journal cannot record a report at this instant; nothing was counted, retry later")
				}
				return err
			}
		} else if err := h.resetCounter(ctx, st, value); err != nil {
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

// acceptCounter writes the counter of an ACCEPTED report and returns the pair's
// new report_seq.
func (h *UseCase) acceptCounter(ctx context.Context, st *State, value []byte) (int64, error) {
	pair := st.Pair
	if pair.ResourceKey != nil {
		return h.commandRepo.AcceptResourceUsage(ctx, pair.InstanceID, pair.EntitlementID, *pair.ResourceKey, value, st.OrganizationID, st.Resolution.Window.Start)
	}
	return h.commandRepo.AcceptEntitlementUsage(ctx, pair.InstanceID, pair.EntitlementID, value, st.OrganizationID, st.Resolution.Window.Start)
}

// resetCounter writes the rollover reset a refused report still persists, and
// counts no report.
func (h *UseCase) resetCounter(ctx context.Context, st *State, value []byte) error {
	pair := st.Pair
	if pair.ResourceKey != nil {
		return h.commandRepo.ResetResourceUsage(ctx, pair.InstanceID, pair.EntitlementID, *pair.ResourceKey, value, st.OrganizationID, st.Resolution.Window.Start)
	}
	return h.commandRepo.ReportEntitlementUsage(ctx, pair.InstanceID, pair.EntitlementID, value, st.OrganizationID, st.Resolution.Window.Start)
}

// refuseBeyondCeiling answers 422 to the report that would open one resource
// more than the instance may hold for this entitlement. A resource that already
// has its counter, and any report of an entitlement that counts per instance,
// pass: the ceiling is on how many resources there are, never on how often one
// reports. The count runs under the pair's lock, so no concurrent report can
// open a resource between it and this report's own write.
func (h *UseCase) refuseBeyondCeiling(ctx context.Context, pair *UsageContext) error {
	if pair.ResourceKey == nil || pair.UsageValue != nil {
		return nil
	}
	count, err := h.queryRepo.CountResources(ctx, pair.InstanceID, pair.EntitlementID)
	if err != nil {
		return err
	}
	if count < int64(h.maxResources) {
		return nil
	}
	h.ceilingReached.Add(ctx, 1)
	return kaitenerrors.UnprocessableEntityWithErrors(
		"ReportEntitlementUsageMetric.ResourceLimitReached",
		fmt.Sprintf("this instance already holds the most resources an entitlement may count (%d): delete one that no longer exists, or report for one that does", h.maxResources),
		&kaitenerrors.ErrorDetail{Message: "a resource this entitlement does not count yet", Location: resourceKeyLocation, Value: *pair.ResourceKey},
	)
}
