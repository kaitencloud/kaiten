package reportentitlementusagemetric

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
)

// AcceptResourceUsage writes the counter of one resource for an ACCEPTED report
// and moves the pair's report_seq forward by one, returning it: the report_seq
// of the usage_ledger row the same transaction writes next. It is
// AcceptEntitlementUsage for an entitlement that counts per resource -- the
// pair's row it moves is the one every reader of entitlement_usage reads, and
// holds the highest counter of the window by the time this returns. Runs under
// the pair's advisory lock, which is what keeps both the sequence and that
// summary exact.
func (r *CommandRepository) AcceptResourceUsage(
	ctx context.Context, instanceID, entitlementID uuid.UUID, resourceKey string, value []byte,
	organizationID uuid.UUID, periodStart *time.Time,
) (int64, error) {
	if err := r.upsertResource(ctx, instanceID, entitlementID, resourceKey, value, organizationID, periodStart); err != nil {
		return 0, err
	}
	return r.settleResources(ctx, instanceID, entitlementID, organizationID, periodStart, 1)
}

// ResetResourceUsage writes one resource's counter without counting a report:
// the rollover reset a refused report still persists, which leaves report_seq
// where it is. ReportEntitlementUsage for an entitlement that counts per
// resource.
func (r *CommandRepository) ResetResourceUsage(
	ctx context.Context, instanceID, entitlementID uuid.UUID, resourceKey string, value []byte,
	organizationID uuid.UUID, periodStart *time.Time,
) error {
	if err := r.upsertResource(ctx, instanceID, entitlementID, resourceKey, value, organizationID, periodStart); err != nil {
		return err
	}
	_, err := r.settleResources(ctx, instanceID, entitlementID, organizationID, periodStart, 0)
	return err
}

func (r *CommandRepository) upsertResource(
	ctx context.Context, instanceID, entitlementID uuid.UUID, resourceKey string, value []byte,
	organizationID uuid.UUID, periodStart *time.Time,
) error {
	return r.q(ctx).UpsertEntitlementResourceUsage(ctx, db.UpsertEntitlementResourceUsageParams{
		EntitlementID:  entitlementID,
		InstanceID:     instanceID,
		ResourceKey:    resourceKey,
		OrganizationID: organizationID,
		Value:          value,
		PeriodStart:    optionalTimestamp(periodStart),
	})
}

// settleResources rewrites the pair's row from its resources, in the window the
// write landed in, and moves report_seq by seqStep.
func (r *CommandRepository) settleResources(
	ctx context.Context, instanceID, entitlementID, organizationID uuid.UUID, periodStart *time.Time, seqStep int64,
) (int64, error) {
	return r.q(ctx).SettleEntitlementResourceUsage(ctx, db.SettleEntitlementResourceUsageParams{
		EntitlementID:  entitlementID,
		InstanceID:     instanceID,
		OrganizationID: organizationID,
		PeriodStart:    optionalTimestamp(periodStart),
		SeqStep:        seqStep,
	})
}
