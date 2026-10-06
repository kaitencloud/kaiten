package updatelicenseentitlement

import (
	"context"
	"errors"
	"fmt"
	"math"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	entitlementschema "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
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

func (r *CommandRepository) UpdateLicenseEntitlement(ctx context.Context, licenseSlug, entitlementSlug string, command *Command, userID uuid.UUID, organizationID uuid.UUID) (*schema.LicenseEntitlement, error) {
	if err := prices.RefuseBilled(ctx, r.q(ctx), "UpdateLicenseEntitlement", organizationID, licenseSlug); err != nil {
		return nil, err
	}
	queries := r.q(ctx)

	current, err := queries.GetEntitlementForLicense(ctx, db.GetEntitlementForLicenseParams{
		OrganizationID:  organizationID,
		LicenseSlug:     licenseSlug,
		EntitlementSlug: entitlementSlug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("UpdateLicenseEntitlement.NotFound", "License entitlement not found for license "+licenseSlug+" and entitlement "+entitlementSlug)
		}
		return nil, err
	}

	// current.EntitlementType is this module's own copy of the shared
	// Postgres enum (from its own compiled license_entitlement query, which
	// joins in the entitlement's type -- not a cross-module call), so it's
	// converted by value rather than through entitlements'
	// dbmap.ToEntitlementType, which takes that module's own generated enum
	// type.
	normalizedValue, err := entitlementvalue.NormalizeLicenseValue(
		entitlementschema.Type(current.EntitlementType),
		command.Value,
	)
	if err != nil {
		return nil, kaitenerrors.Validation("UpdateLicenseEntitlement.InvalidValue", err.Error())
	}
	valueBytes, err := entitlementvalue.ToBytes(normalizedValue)
	if err != nil {
		return nil, err
	}

	dbOveragePercent, err := resolveOveragePercent(normalizedValue, command.LimitCapExceededOveragePercent)
	if err != nil {
		return nil, kaitenerrors.Validation("UpdateLicenseEntitlement.InvalidLimitCapExceededOveragePercent", err.Error())
	}

	res, err := queries.UpdateEntitlementForLicense(ctx, db.UpdateEntitlementForLicenseParams{
		LicenseSlug:                    licenseSlug,
		OrganizationID:                 organizationID,
		EntitlementSlug:                entitlementSlug,
		Value:                          valueBytes,
		LimitCapExceededOveragePercent: dbOveragePercent,
		UserID:                         userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("UpdateLicenseEntitlement.NotFound", "License entitlement not found for license "+licenseSlug+" and entitlement "+entitlementSlug)
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

// resolveOveragePercent derives the license_entitlement column value for
// limit_cap_exceeded_overage_percent from the grant's own normalized value:
// nil for a non-numeric value (BOOLEAN/CONFIG have no cap to enforce), the
// caller-supplied override when given, or
// entitlementvalue.DefaultLimitCapExceededOveragePercent otherwise --
// preserving pre-existing hard-by-default behavior for a caller that only
// sends a value.
func resolveOveragePercent(normalizedValue *entitlementvalue.EntitlementJSONValue, override *int32) (*int16, error) {
	if normalizedValue.Type != entitlementvalue.TypeNumber {
		if override != nil {
			return nil, fmt.Errorf("limitCapExceededOveragePercent is only allowed when value.type is %q", entitlementvalue.TypeNumber)
		}
		return nil, nil
	}

	threshold, ok := normalizedValue.Value.(float64)
	if !ok {
		return nil, fmt.Errorf("entitlement numeric value is invalid")
	}

	overagePercent := entitlementvalue.DefaultLimitCapExceededOveragePercent(threshold)
	if override != nil {
		overagePercent = *override
	}
	if err := entitlementvalue.ValidateLimitCapExceededOveragePercent(threshold, overagePercent); err != nil {
		return nil, err
	}
	// limit_cap_exceeded_overage_percent is a SMALLINT column: this is a
	// storage bound, not a business rule, so it is asserted here rather than
	// in entitlementvalue.ValidateLimitCapExceededOveragePercent.
	if overagePercent > math.MaxInt16 {
		return nil, fmt.Errorf("limitCapExceededOveragePercent must be at most %d", math.MaxInt16)
	}

	//nolint:gosec // bounded to [-1, math.MaxInt16] by ValidateLimitCapExceededOveragePercent and the check above
	result := int16(overagePercent)
	return &result, nil
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
