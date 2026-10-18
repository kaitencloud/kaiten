package getentitlementsusagemetrics

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

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

func (r *QueryRepository) GetEntitlementsUsageMetrics(ctx context.Context, instanceSlug string, organizationID uuid.UUID) ([]entitlementUsageSchema.EntitlementUsage, error) {
	instanceID, err := r.resolveInstanceSlug(ctx, instanceSlug, organizationID)
	if err != nil {
		return nil, err
	}

	entitlements, err := r.repository.GetEntitlementsUsageForInstanceWithFallback(ctx, db.GetEntitlementsUsageForInstanceWithFallbackParams{
		OrganizationID: organizationID,
		InstanceID:     instanceID,
	})
	if err != nil {
		return nil, err
	}

	return MapUsageRows(entitlements)
}

// MapUsageRows converts fallback-query rows into wire EntitlementUsage values:
// NUMBER-family entitlements get their usage (zero-defaulted when nothing was
// reported yet, and lazily windowed when a periodic reset is configured --
// see usage.InWindow), other types carry the
// license value. Shared with the GraphQL Instance.entitlementUsage loader so
// both surfaces stay identical. now (database time) is read off
// rows[0].Now rather than a separate GetDatabaseNow round trip -- every row
// in one query execution already carries the same value, folded in by
// GetEntitlementsUsageForInstanceWithFallback itself.
func MapUsageRows(rows []db.GetEntitlementsUsageForInstanceWithFallbackRow) ([]entitlementUsageSchema.EntitlementUsage, error) {
	result := make([]entitlementUsageSchema.EntitlementUsage, 0, len(rows))
	if len(rows) == 0 {
		return result, nil
	}
	now := rows[0].Now.Time.UTC()

	for _, e := range rows {
		isNumberFamily := e.EntitlementType == db.EntitlementTypeNUMBER || e.EntitlementType == db.EntitlementTypeNUMBERAICREDIT

		licenseSlug := ""
		if e.LicenseSlug != nil {
			licenseSlug = *e.LicenseSlug
		}
		gauge := usage.Gauge{
			EntitlementID:   e.EntitlementID,
			EntitlementSlug: e.EntitlementSlug,
			LicenseID:       e.LicenseID,
			LicenseSlug:     licenseSlug,
			NumberFamily:    isNumberFamily,
			LicenseValue:    e.LicenseValue,
		}

		if isNumberFamily {
			stored := usage.Stored{Present: e.UsageValue != nil}
			if stored.Present {
				value, err := entitlementvalue.ParseNumberUsageValue(e.UsageValue)
				if err != nil {
					return nil, kaitenerrors.Validation("GetEntitlementsUsageMetrics.InvalidUsageValue", err.Error())
				}
				stored.Counter = usage.Counter{Value: value.Value, EventCount: value.EventCount}
				if e.PeriodStart.Valid {
					stored.PeriodStart = ptr.To(e.PeriodStart.Time.UTC())
				}
			}

			window, err := usage.CurrentWindow(now, usage.PeriodicityOf(e.ResetPeriod, e.ResetAnchor, e.StartLicenseDate.Time.UTC()))
			if err != nil {
				return nil, err
			}
			gauge.Window = window
			gauge.Counter = usage.InWindow(stored, window)
		}

		out, err := usage.Present(gauge)
		if errors.Is(err, usage.ErrMissingLicenseValue) {
			return nil, kaitenerrors.Validation("GetEntitlementsUsageMetrics.MissingLicenseValue", err.Error())
		}
		if err != nil {
			return nil, err
		}
		result = append(result, *out)
	}
	return result, nil
}

func (r *QueryRepository) resolveInstanceSlug(ctx context.Context, instanceSlug string, organizationID uuid.UUID) (uuid.UUID, error) {
	instance, err := r.repository.GetOneInstance(ctx, db.GetOneInstanceParams{
		OrganizationID: organizationID,
		Slug:           instanceSlug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.UUID{}, kaitenerrors.NotFoundf("GetEntitlementsUsageMetrics.InstanceNotFound", "Instance with slug %q not found", instanceSlug)
		}
		return uuid.UUID{}, err
	}
	return instance.ID, nil
}
