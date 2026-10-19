package getentitlementusagemetrics

import (
	"context"
	"github.com/shopspring/decimal"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/database/pgtime"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/effectivelookup"
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

func (r *QueryRepository) GetEntitlementUsageMetrics(ctx context.Context, instanceSlug string, entitlementSlug string, organizationID uuid.UUID) (*entitlementUsageSchema.EntitlementUsage, error) {
	done := effectivelookup.Time(ctx, effectivelookup.ReaderREST)
	result, err := r.repository.GetEntitlementUsageForInstanceOrDefault(ctx, db.GetEntitlementUsageForInstanceOrDefaultParams{
		OrganizationID:  organizationID,
		InstanceSlug:    instanceSlug,
		EntitlementSlug: entitlementSlug,
	})
	done()
	if err != nil {
		return nil, err
	}

	if result.InstanceID == nil {
		return nil, kaitenerrors.NotFoundf("GetEntitlementUsageMetrics.InstanceNotFound", "Instance with slug %q not found", instanceSlug)
	}
	if result.EntitlementID == nil {
		return nil, kaitenerrors.NotFoundf("GetEntitlementUsageMetrics.EntitlementNotFound", "Entitlement with slug %q not found", entitlementSlug)
	}
	if result.GrantedEntitlementID == nil {
		return nil, kaitenerrors.NotFoundf("GetEntitlementUsageMetrics.EntitlementNotAssigned", "Entitlement with slug %q is not assigned to the license used by instance %q", entitlementSlug, instanceSlug)
	}

	// The limit is the instance's effective entitlement, whatever its type:
	// for the NUMBER family it is the cap the usage below is measured against,
	// for BOOLEAN and CONFIG it is the value itself.
	limit, err := entitlementUsageSchema.ParseEntitlementValue(result.EffectiveValue)
	if err != nil {
		return nil, err
	}

	var resolvedValue entitlementUsageSchema.EntitlementValue
	var currentPeriodStart, currentPeriodEnd *time.Time
	isNumberFamily := result.EntitlementType != nil &&
		(*result.EntitlementType == db.EntitlementTypeNUMBER || *result.EntitlementType == db.EntitlementTypeNUMBERAICREDIT)

	if isNumberFamily {
		var stored *entitlementvalue.NumberUsageValue
		if result.UsageValue != nil {
			stored, err = entitlementvalue.ParseNumberUsageValue(result.UsageValue)
			if err != nil {
				return nil, kaitenerrors.Validation("GetEntitlementUsageMetrics.InvalidUsageValue", err.Error())
			}
		}

		usage := stored
		if usage == nil {
			usage = entitlementvalue.NewDefaultNumberUsageValue()
		}

		// Periodic usage windows: pure lazy read, no write. A stale
		// row is not mutated here -- it stays physically stored until the
		// next report rolls it over. now is folded into the same query
		// (GetEntitlementUsageForInstanceOrDefault) rather than a separate
		// GetDatabaseNow round trip.
		if result.ResetPeriod != nil {
			var storedPeriodStart *time.Time
			if result.PeriodStart.Valid {
				storedPeriodStart = ptr.To(result.PeriodStart.Time.UTC())
			}
			basis := period.NewBasis(result.StartLicenseDate.Time.UTC(), result.BillingStatus,
				pgtime.PgTimeStampToTimePtr(result.BillingAnchorAt), pgtime.PgTimeStampToTimePtr(result.LiveEndedAt))
			window, _, err := period.ResolveCurrentOn(result.Now.Time.UTC(), storedPeriodStart, period.ResetPeriod(*result.ResetPeriod), period.ResetAnchor(*result.ResetAnchor), basis)
			if err != nil {
				return nil, err
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
			return nil, kaitenerrors.Validation("GetEntitlementUsageMetrics.MissingLicenseValue", "license entitlement carries no value")
		}
		resolvedValue = *limit
	}

	licenseSlug := ""
	if result.LicenseSlug != nil {
		licenseSlug = *result.LicenseSlug
	}

	provenance, err := entitlementUsageSchema.ParseProvenance(result.Provenance)
	if err != nil {
		return nil, err
	}
	var reserved *string
	if result.EntitlementType != nil && *result.EntitlementType == db.EntitlementTypeNUMBERAICREDIT {
		text := decimal.NewFromBigInt(result.Reserved.Int, result.Reserved.Exp).String()
		reserved = &text
	}
	return &entitlementUsageSchema.EntitlementUsage{
		Reserved:                       reserved,
		EntitlementID:                  *result.EntitlementID,
		EntitlementSlug:                *result.EntitlementSlug,
		LicenseID:                      *result.LicenseID,
		LicenseSlug:                    licenseSlug,
		Value:                          resolvedValue,
		Limit:                          limit,
		CurrentPeriodStart:             currentPeriodStart,
		CurrentPeriodEnd:               currentPeriodEnd,
		LimitCapExceededOveragePercent: result.EffectiveOveragePercent,
		Source:                         sourceOf(result.Source, result.LicenseEntitlementID),
		Provenance:                     provenance,
	}, nil
}

// sourceOf is the view's source of a row the fallback read found in it, else
// the licence's (§7.5).
func sourceOf(source *string, licenseEntitlementID *uuid.UUID) string {
	if source != nil {
		return *source
	}
	return entitlementUsageSchema.SourceOf(licenseEntitlementID)
}
