package getentitlementsusagemetrics

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/period"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	entitlementUsageSchema "github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
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
// see entitlementvalue.ResolveCurrentWindowUsage), other types carry the
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
		// The limit is the license grant, whatever the entitlement type: for the
		// NUMBER family it is the cap the usage below is measured against, for
		// BOOLEAN and CONFIG it is the value itself.
		limit, err := entitlementUsageSchema.ParseEntitlementValue(e.LicenseValue)
		if err != nil {
			return nil, err
		}

		var resolvedValue entitlementUsageSchema.EntitlementValue
		var currentPeriodStart, currentPeriodEnd *time.Time

		if e.EntitlementType == db.EntitlementTypeNUMBER || e.EntitlementType == db.EntitlementTypeNUMBERAICREDIT {
			var stored *entitlementvalue.NumberUsageValue
			if e.UsageValue != nil {
				stored, err = entitlementvalue.ParseNumberUsageValue(e.UsageValue)
				if err != nil {
					return nil, kaitenerrors.Validation("GetEntitlementsUsageMetrics.InvalidUsageValue", err.Error())
				}
			}

			usage := stored
			if usage == nil {
				usage = entitlementvalue.NewDefaultNumberUsageValue()
			}

			if e.ResetPeriod != nil {
				window, err := period.Current(now, period.ResetPeriod(*e.ResetPeriod), period.ResetAnchor(*e.ResetAnchor), e.StartLicenseDate.Time.UTC())
				if err != nil {
					return nil, err
				}

				var storedPeriodStart *time.Time
				if e.PeriodStart.Valid {
					storedPeriodStart = ptr.To(e.PeriodStart.Time.UTC())
				}
				usage = entitlementvalue.ResolveCurrentWindowUsage(stored, storedPeriodStart, window)
				currentPeriodStart, currentPeriodEnd = &window.Start, &window.End
			}

			resolvedValue = entitlementUsageSchema.EntitlementValue{
				Number: &entitlementUsageSchema.NumberEntitlementValue{
					Type:       "number",
					Value:      usage.Value,
					EventCount: usage.EventCount,
				},
			}
		} else {
			if limit == nil {
				return nil, kaitenerrors.Validation("GetEntitlementsUsageMetrics.MissingLicenseValue", "license entitlement carries no value")
			}
			resolvedValue = *limit
		}

		licenseSlug := ""
		if e.LicenseSlug != nil {
			licenseSlug = *e.LicenseSlug
		}
		result = append(result, entitlementUsageSchema.EntitlementUsage{
			EntitlementID:      e.EntitlementID,
			EntitlementSlug:    e.EntitlementSlug,
			LicenseID:          e.LicenseID,
			LicenseSlug:        licenseSlug,
			Value:              resolvedValue,
			Limit:              limit,
			CurrentPeriodStart: currentPeriodStart,
			CurrentPeriodEnd:   currentPeriodEnd,
		})
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
