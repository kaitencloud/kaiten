package getentitlementgroupusage

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	instancesschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Repository defines the interface for getting entitlement group usage.
// QueryRepository implements Repository using sqlc queries.
type QueryRepository struct {
	policy     aiusage.Policy
	repository *db.Queries
	usage      UsageReader
}

// NewQueryRepository creates a new QueryRepository. usage reads a combined
// member of the group; without it such a member has no usage.
func NewQueryRepository(repository *db.Queries, policy aiusage.Policy, usage UsageReader) *QueryRepository {
	return &QueryRepository{
		policy:     policy,
		repository: repository,
		usage:      usage,
	}
}

// GetEntitlementGroupUsage returns the aggregated usage for an entitlement group for a given instance.
func (r *QueryRepository) GetEntitlementGroupUsage(ctx context.Context, groupSlug string, instanceSlug string, organizationID uuid.UUID) ([]*schema.EntitlementGroupUsage, error) {
	ctx = r.policy.ForOrganization(ctx, organizationID)

	params := db.GetEntitlementGroupUsageParams{
		HideAi:         !r.policy.Enabled(ctx),
		GroupSlug:      groupSlug,
		InstanceSlug:   instanceSlug,
		OrganizationID: organizationID,
	}

	rows, err := r.repository.GetEntitlementGroupUsage(ctx, params)
	if err != nil {
		return nil, err
	}

	result := make([]*schema.EntitlementGroupUsage, 0, len(rows))
	// The instance's usage list, read once, for the combined members of the group.
	var computed map[string]instancesschema.EntitlementUsage
	for _, row := range rows {
		item, err := dbmap.ToEntitlementGroupUsage(&row)
		if err != nil {
			return nil, kaitenerrors.Validation("GetEntitlementGroupUsage.InvalidStoredValue", err.Error())
		}

		// A combined member has no counter, no grant and no window of its own to
		// join: it reads as the sum of the sources the instance is granted, with
		// theirs. None granted leaves it with no usage, as any member the
		// instance is not granted.
		if row.UsageSource == db.EntitlementUsageSourceCOMBINEDUSAGE {
			if computed == nil {
				if computed, err = r.computedUsage(ctx, instanceSlug); err != nil {
					return nil, err
				}
			}
			item.UsageValue, item.LicenseValue, item.CurrentPeriodStart, item.CurrentPeriodEnd = nil, nil, nil, nil
			if read, ok := computed[row.EntitlementSlug]; ok {
				item.UsageValue, item.LicenseValue = &read.Value, read.Limit
				item.CurrentPeriodStart, item.CurrentPeriodEnd = read.CurrentPeriodStart, read.CurrentPeriodEnd
			}
			result = append(result, item)
			continue
		}

		isNumberFamily := row.EntitlementType == db.EntitlementTypeNUMBER || row.EntitlementType == db.EntitlementTypeNUMBERAICREDIT
		if isNumberFamily && row.ResetPeriod != nil {
			var stored *entitlementvalue.NumberUsageValue
			if row.UsageValue != nil {
				stored, err = entitlementvalue.ParseNumberUsageValue(row.UsageValue)
				if err != nil {
					return nil, kaitenerrors.Validation("GetEntitlementGroupUsage.InvalidUsageValue", err.Error())
				}
			}

			// now (database time) comes from row.Now -- folded into
			// GetEntitlementGroupUsage itself rather than a separate
			// GetDatabaseNow round trip.
			var storedPeriodStart *time.Time
			if row.PeriodStart.Valid {
				storedPeriodStart = ptr.To(row.PeriodStart.Time.UTC())
			}
			basis := period.NewBasis(row.StartLicenseDate.Time.UTC(), row.BillingStatus,
				pgtime.PgTimeStampToTimePtr(row.BillingAnchorAt), pgtime.PgTimeStampToTimePtr(row.LiveEndedAt))
			window, _, err := period.ResolveCurrentOn(row.Now.Time.UTC(), storedPeriodStart, period.ResetPeriod(*row.ResetPeriod), period.ResetAnchor(*row.ResetAnchor), basis)
			if err != nil {
				return nil, err
			}
			resolved := entitlementvalue.ResolveCurrentWindowUsage(stored, storedPeriodStart, window)

			item.UsageValue = &instancesschema.EntitlementValue{
				Number: &instancesschema.NumberEntitlementValue{
					Type:       entitlementvalue.TypeNumber,
					Value:      resolved.Value,
					EventCount: resolved.EventCount,
				},
			}
			item.CurrentPeriodStart, item.CurrentPeriodEnd = &window.Start, &window.End
		}

		result = append(result, item)
	}

	return result, nil
}

// computedUsage is the instance's usage list by entitlement slug. Empty when no
// reader was given.
func (r *QueryRepository) computedUsage(ctx context.Context, instanceSlug string) (map[string]instancesschema.EntitlementUsage, error) {
	computed := map[string]instancesschema.EntitlementUsage{}
	if r.usage == nil {
		return computed, nil
	}

	usages, err := r.usage.ExecuteWithinOperation(ctx, instanceSlug)
	if err != nil {
		return nil, err
	}
	for _, usage := range usages {
		computed[usage.EntitlementSlug] = usage
	}

	return computed, nil
}
