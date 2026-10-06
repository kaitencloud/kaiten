package deletelicenseentitlement

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves the sqlc Queries bound to whatever DBTX is active for
// ctx -- the caller's transaction if Transact opened one, the pool
// otherwise.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

func (r *CommandRepository) DeleteLicenseEntitlement(ctx context.Context, licenseSlug, entitlementSlug string, organizationID uuid.UUID) (*schema.LicenseEntitlement, error) {
	if err := r.refuseMeteredGrant(ctx, licenseSlug, entitlementSlug, organizationID); err != nil {
		return nil, err
	}

	res, err := r.q(ctx).RemoveEntitlementFromLicense(ctx, db.RemoveEntitlementFromLicenseParams{
		LicenseSlug:     licenseSlug,
		OrganizationID:  organizationID,
		EntitlementSlug: entitlementSlug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("DeleteLicenseEntitlement.LicenseEntitlementNotFound", "License entitlement with License slug "+licenseSlug+" and Entitlement slug "+entitlementSlug+" not found")
		}
		return nil, err
	}

	valueMap, err := entitlementvalue.ToMap(res.Value)
	if err != nil {
		return nil, err
	}

	return &schema.LicenseEntitlement{
		EntitlementSlug:                res.EntitlementSlug,
		EntitlementName:                res.EntitlementName,
		EntitlementType:                string(res.EntitlementType),
		LicenseID:                      res.LicenseID,
		LicenseSlug:                    res.LicenseSlug,
		CreatedBy:                      shared.User{ID: res.CreatedByID, Name: res.CreatedByName},
		CreatedAt:                      res.CreatedAt.Time,
		UpdatedBy:                      shared.User{ID: res.UpdatedByID, Name: res.UpdatedByName},
		UpdatedAt:                      res.UpdatedAt.Time,
		Value:                          valueMap,
		LimitCapExceededOveragePercent: int16PtrToInt32Ptr(res.LimitCapExceededOveragePercent),
	}, nil
}

// refuseMeteredGrant refuses to remove a grant an ACTIVE price of the version
// meters: the price would go on metering an entitlement the version no longer
// grants. The version is locked first, the way a price write locks it, so a
// price created meanwhile cannot slip between the count and the delete. An
// unknown version falls through to the delete's own NotFound.
func (r *CommandRepository) refuseMeteredGrant(ctx context.Context, licenseSlug, entitlementSlug string, organizationID uuid.UUID) error {
	q := r.q(ctx)
	_, err := q.GetLicenseForPricing(ctx, db.GetLicenseForPricingParams{OrganizationID: organizationID, Slug: licenseSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	metering, err := q.CountActivePricesMeteringGrant(ctx, db.CountActivePricesMeteringGrantParams{
		OrganizationID: organizationID, LicenseSlug: licenseSlug, EntitlementSlug: entitlementSlug,
	})
	if err != nil {
		return err
	}
	if metering > 0 {
		return kaitenerrors.Conflict("DeleteLicenseEntitlement.MeteredByPrice",
			"an active price of this licence version meters this entitlement: deprecate the price before removing the grant")
	}
	return nil
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
