package associateentitlementwithlicense

import (
	"context"
	"errors"
	"fmt"
	"math"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/uow"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/licenseview"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// CommandRepository is bound to a *uow.UnitOfWork instead of a fixed
// *db.Queries/licenseview.Port pair: build it once (e.g. in NewUseCase) and
// call its methods directly, inside or outside a Transact closure. Each
// call resolves the DBTX active for ctx -- both this module's own
// generated Queries and the entitlements module's public licenseview.Port
// are rebuilt from that same handle -- so every call here joins whatever
// transaction Transact opened for that ctx, with no db.New(...) or
// licenseview.New(...) at the call site.
type CommandRepository struct {
	uof *uow.UnitOfWork
}

func NewCommandRepository(uof *uow.UnitOfWork) *CommandRepository {
	return &CommandRepository{uof: uof}
}

// q resolves this module's own sqlc Queries bound to whatever DBTX is
// active for ctx.
func (r *CommandRepository) q(ctx context.Context) *db.Queries {
	return db.New(r.uof.DBTX(ctx))
}

// entitlements resolves the entitlements module's public licenseview.Port
// bound to whatever DBTX is active for ctx.
func (r *CommandRepository) entitlements(ctx context.Context) licenseview.Port {
	return licenseview.New(r.uof.DBTX(ctx))
}

func (r *CommandRepository) AssociateEntitlementToLicense(ctx context.Context, licenseSlug string, command *Command, userID uuid.UUID, organizationID uuid.UUID) (*schema.LicenseEntitlement, error) {
	entitlement, err := r.resolveEntitlementSlug(ctx, command.EntitlementSlug, organizationID)
	if err != nil {
		return nil, err
	}

	_, err = r.resolveLicenseSlug(ctx, licenseSlug, organizationID)
	if err != nil {
		return nil, err
	}

	normalizedValue, err := entitlementvalue.NormalizeLicenseValue(
		entitlement.Type,
		command.Value,
	)
	if err != nil {
		return nil, kaitenerrors.Validation("AssociateEntitlementToLicense.InvalidValue", err.Error())
	}
	valueBytes, err := entitlementvalue.ToBytes(normalizedValue)
	if err != nil {
		return nil, err
	}

	dbOveragePercent, err := resolveOveragePercent(normalizedValue, command.LimitCapExceededOveragePercent)
	if err != nil {
		return nil, kaitenerrors.Validation("AssociateEntitlementToLicense.InvalidLimitCapExceededOveragePercent", err.Error())
	}

	res, err := r.q(ctx).AssociateEntitlementToLicense(ctx, db.AssociateEntitlementToLicenseParams{
		LicenseSlug:                    licenseSlug,
		OrganizationID:                 organizationID,
		EntitlementSlug:                command.EntitlementSlug,
		Value:                          valueBytes,
		LimitCapExceededOveragePercent: dbOveragePercent,
		UserID:                         userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.Forbidden(
				"CurrentUser.NotInOrganization",
				fmt.Sprintf("User %s does not belong to organization %s", userID, organizationID),
			)
		}
		// license_entitlement is unique on (license_id, entitlement_id):
		// re-associating an entitlement already on the license is a
		// conflict, not a second row with a second threshold.
		if kaitenerrors.IsUniqueViolation(err) {
			return nil, kaitenerrors.Conflict(
				"AssociateEntitlementToLicense.AlreadyAssociated",
				fmt.Sprintf("Entitlement %q is already associated with license %q", command.EntitlementSlug, licenseSlug),
			)
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

func (r *CommandRepository) resolveLicenseSlug(ctx context.Context, licenseSlug string, organizationID uuid.UUID) (uuid.UUID, error) {
	license, err := r.q(ctx).GetOneLicense(ctx, db.GetOneLicenseParams{
		OrganizationID: organizationID,
		Slug:           licenseSlug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.UUID{}, kaitenerrors.NotFound("AssociateEntitlementToLicense.LicenseNotFound", "License with slug "+licenseSlug+" not found")
		}
		return uuid.UUID{}, err
	}
	return license.ID, nil
}

func (r *CommandRepository) resolveEntitlementSlug(ctx context.Context, entitlementSlug string, organizationID uuid.UUID) (*licenseview.Entitlement, error) {
	entitlement, err := r.entitlements(ctx).GetBySlug(ctx, organizationID, entitlementSlug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, kaitenerrors.NotFound("AssociateEntitlementToLicense.EntitlementNotFound", "Entitlement with slug "+entitlementSlug+" not found")
		}
		return nil, err
	}
	return entitlement, nil
}
