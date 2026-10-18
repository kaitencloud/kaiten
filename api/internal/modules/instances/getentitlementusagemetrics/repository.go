package getentitlementusagemetrics

import (
	"context"
	"errors"

	"github.com/google/uuid"

	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	entitlementUsageSchema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/usage"
	"github.com/kaitencloud/kaiten/api/internal/shared/ptr"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type QueryRepository struct {
	repository *db.Queries
}

func NewQueryRepository(repository *db.Queries) *QueryRepository {
	return &QueryRepository{
		repository: repository,
	}
}

func (r *QueryRepository) GetEntitlementUsageMetrics(ctx context.Context, instanceSlug string, entitlementSlug string, organizationID uuid.UUID) (*entitlementUsageSchema.EntitlementUsage, error) {
	result, err := r.repository.GetEntitlementUsageForInstanceOrDefault(ctx, db.GetEntitlementUsageForInstanceOrDefaultParams{
		OrganizationID:  organizationID,
		InstanceSlug:    instanceSlug,
		EntitlementSlug: entitlementSlug,
	})
	if err != nil {
		return nil, err
	}

	if result.InstanceID == nil {
		return nil, kaitenerrors.NotFoundf("GetEntitlementUsageMetrics.InstanceNotFound", "Instance with slug %q not found", instanceSlug)
	}
	if result.EntitlementID == nil {
		return nil, kaitenerrors.NotFoundf("GetEntitlementUsageMetrics.EntitlementNotFound", "Entitlement with slug %q not found", entitlementSlug)
	}
	if result.LicenseEntitlementID == nil {
		return nil, kaitenerrors.NotFoundf("GetEntitlementUsageMetrics.EntitlementNotAssigned", "Entitlement with slug %q is not assigned to the license used by instance %q", entitlementSlug, instanceSlug)
	}

	isNumberFamily := result.EntitlementType != nil &&
		(*result.EntitlementType == db.EntitlementTypeNUMBER || *result.EntitlementType == db.EntitlementTypeNUMBERAICREDIT)

	licenseSlug := ""
	if result.LicenseSlug != nil {
		licenseSlug = *result.LicenseSlug
	}
	gauge := usage.Gauge{
		EntitlementID:   *result.EntitlementID,
		EntitlementSlug: *result.EntitlementSlug,
		LicenseID:       *result.LicenseID,
		LicenseSlug:     licenseSlug,
		NumberFamily:    isNumberFamily,
		LicenseValue:    result.LicenseValue,
	}

	if isNumberFamily {
		stored := usage.Stored{Present: result.UsageValue != nil}
		if stored.Present {
			value, err := entitlementvalue.ParseNumberUsageValue(result.UsageValue)
			if err != nil {
				return nil, kaitenerrors.Validation("GetEntitlementUsageMetrics.InvalidUsageValue", err.Error())
			}
			stored.Counter = usage.Counter{Value: value.Value, EventCount: value.EventCount}
			if result.PeriodStart.Valid {
				stored.PeriodStart = ptr.To(result.PeriodStart.Time.UTC())
			}
		}

		// Periodic usage windows: pure lazy read, no write. A stale row is
		// not mutated here -- it stays physically stored until the next
		// report rolls it over. now is folded into the same query
		// (GetEntitlementUsageForInstanceOrDefault) rather than a separate
		// GetDatabaseNow round trip.
		window, err := usage.CurrentWindow(result.Now.Time.UTC(), usage.PeriodicityOf(result.ResetPeriod, result.ResetAnchor, result.StartLicenseDate.Time.UTC()))
		if err != nil {
			return nil, err
		}
		gauge.Window = window
		gauge.Counter = usage.InWindow(stored, window)
	}

	out, err := usage.Present(gauge)
	if errors.Is(err, usage.ErrMissingLicenseValue) {
		return nil, kaitenerrors.Validation("GetEntitlementUsageMetrics.MissingLicenseValue", err.Error())
	}
	return out, err
}
