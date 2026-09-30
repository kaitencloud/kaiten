package getlicenseentitlement

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
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

func (r *QueryRepository) GetLicenseEntitlement(ctx context.Context, licenseSlug, entitlementSlug string, organizationID uuid.UUID) (*schema.LicenseEntitlement, error) {
	args := db.GetEntitlementForLicenseParams{
		OrganizationID:  organizationID,
		LicenseSlug:     licenseSlug,
		EntitlementSlug: entitlementSlug,
	}

	result, err := r.repository.GetEntitlementForLicense(ctx, args)
	if err != nil {
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			return nil, kaitenerrors.NotFound("GetLicenseEntitlement.NotFound", "License entitlement not found")
		default:
			return nil, err
		}
	}

	valueMap, err := entitlementvalue.ToMap(result.Value)
	if err != nil {
		return nil, err
	}

	return &schema.LicenseEntitlement{
		EntitlementSlug:                result.EntitlementSlug,
		EntitlementName:                result.EntitlementName,
		EntitlementType:                string(result.EntitlementType),
		LicenseID:                      result.LicenseID,
		LicenseSlug:                    result.LicenseSlug,
		CreatedBy:                      shared.User{ID: result.CreatedByID, Name: result.CreatedByName},
		CreatedAt:                      result.CreatedAt.Time,
		UpdatedBy:                      shared.User{ID: result.UpdatedByID, Name: result.UpdatedByName},
		UpdatedAt:                      result.UpdatedAt.Time,
		Value:                          valueMap,
		LimitCapExceededOveragePercent: int16PtrToInt32Ptr(result.LimitCapExceededOveragePercent),
	}, nil
}

// int16PtrToInt32Ptr widens the SMALLINT column's Go representation to the
// API's int32, preserving nil (non-numeric grants have no overage percent).
func int16PtrToInt32Ptr(v *int16) *int32 {
	if v == nil {
		return nil
	}
	result := int32(*v)
	return &result
}
