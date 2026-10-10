package getentitlementgroupusage

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/dbmap"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	instancesschema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Repository defines the interface for getting entitlement group usage.
// QueryRepository implements Repository using sqlc queries.
type QueryRepository struct {
	repository *db.Queries
}

// NewQueryRepository creates a new QueryRepository.
func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

// GetEntitlementGroupUsage returns the aggregated usage for an entitlement group for a given instance.
func (r *QueryRepository) GetEntitlementGroupUsage(ctx context.Context, groupSlug string, instanceSlug string, organizationID uuid.UUID) ([]*schema.EntitlementGroupUsage, error) {
	params := db.GetEntitlementGroupUsageParams{
		GroupSlug:      groupSlug,
		InstanceSlug:   instanceSlug,
		OrganizationID: organizationID,
	}

	rows, err := r.repository.GetEntitlementGroupUsage(ctx, params)
	if err != nil {
		return nil, err
	}

	result := make([]*schema.EntitlementGroupUsage, 0, len(rows))
	for _, row := range rows {
		item, err := dbmap.ToEntitlementGroupUsage(&row)
		if err != nil {
			return nil, kaitenerrors.Validation("GetEntitlementGroupUsage.InvalidStoredValue", err.Error())
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
			window, _, err := period.ResolveCurrent(row.Now.Time.UTC(), storedPeriodStart, period.ResetPeriod(*row.ResetPeriod), period.ResetAnchor(*row.ResetAnchor), row.StartLicenseDate.Time.UTC())
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
