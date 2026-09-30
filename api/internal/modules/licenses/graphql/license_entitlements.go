package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	entitlementvalue "github.com/kaitencloud/kaiten/api/internal/modules/entitlements/value"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	shared "github.com/kaitencloud/kaiten/api/internal/shared/user"
)

// Dataloader names
const (
	LicenseEntitlementsLoaderName = "LicenseEntitlementsLoader"
)

// newLicenseEntitlementsBatchFn loads a license's entitlement grants by
// license ID. There is no batched SQL for multiple licenses yet, so the batch
// iterates keys — still one round-trip per license server-side, versus one
// HTTP round-trip per license from the browser before.
func newLicenseEntitlementsBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, []schema.LicenseEntitlement] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]schema.LicenseEntitlement] {
		results := make([]*dataloaderLib.Result[[]schema.LicenseEntitlement], len(keys))

		identity, ok := principal.FromContext(ctx)
		if !ok {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]schema.LicenseEntitlement]{Error: ErrMissingIdentity}
			}
			return results
		}

		for i, licenseID := range keys {
			entitlements, err := loadLicenseEntitlements(ctx, queries, identity.OrganizationID, licenseID)
			if err != nil {
				results[i] = &dataloaderLib.Result[[]schema.LicenseEntitlement]{Error: err}
				continue
			}
			results[i] = &dataloaderLib.Result[[]schema.LicenseEntitlement]{Data: entitlements}
		}
		return results
	}
}

func loadLicenseEntitlements(
	ctx context.Context,
	queries *db.Queries,
	organizationID, licenseID uuid.UUID,
) ([]schema.LicenseEntitlement, error) {
	rows, err := queries.GetEntitlementsForLicense(ctx, db.GetEntitlementsForLicenseParams{
		LicenseID:      licenseID,
		OrganizationID: organizationID,
	})
	if err != nil {
		return nil, err
	}

	licenseEntitlements := make([]schema.LicenseEntitlement, len(rows))
	for i, ent := range rows {
		valueMap, err := entitlementvalue.ToMap(ent.Value)
		if err != nil {
			return nil, err
		}

		licenseEntitlements[i] = schema.LicenseEntitlement{
			EntitlementSlug:                ent.EntitlementSlug,
			EntitlementName:                ent.EntitlementName,
			EntitlementType:                string(ent.EntitlementType),
			LicenseID:                      ent.LicenseID,
			LicenseSlug:                    "", // resolved lazily below when known by the caller
			CreatedBy:                      shared.User{ID: ent.CreatedByID, Name: ent.CreatedByName},
			CreatedAt:                      ent.CreatedAt.Time,
			UpdatedBy:                      shared.User{ID: ent.UpdatedByID, Name: ent.UpdatedByName},
			UpdatedAt:                      ent.UpdatedAt.Time,
			Value:                          valueMap,
			LimitCapExceededOveragePercent: int16PtrToInt32Ptr(ent.LimitCapExceededOveragePercent),
		}
	}
	return licenseEntitlements, nil
}

// LoadLicenseEntitlements loads the entitlement grants of one license using the
// dataloader, stamping the license slug the caller already holds.
func LoadLicenseEntitlements(ctx context.Context, licenseID uuid.UUID, licenseSlug string) ([]schema.LicenseEntitlement, error) {
	loader, err := GetLicenseEntitlementsLoader(ctx)
	if err != nil {
		return nil, err
	}

	thunk := loader.Load(ctx, licenseID)
	entitlements, err := thunk()
	if err != nil {
		return nil, err
	}

	stamped := make([]schema.LicenseEntitlement, len(entitlements))
	for i, ent := range entitlements {
		ent.LicenseSlug = licenseSlug
		stamped[i] = ent
	}
	return stamped, nil
}

// GetLicenseEntitlementsLoader retrieves the license entitlements loader from context.
func GetLicenseEntitlementsLoader(ctx context.Context) (*dataloaderLib.Loader[uuid.UUID, []schema.LicenseEntitlement], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[uuid.UUID, []schema.LicenseEntitlement](loaders, LicenseEntitlementsLoaderName)
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
