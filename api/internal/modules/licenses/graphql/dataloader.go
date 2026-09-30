package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// Dataloader names
const (
	LicenseLoaderName       = "LicenseLoader"
	LicenseFamilyLoaderName = "LicenseFamilyLoader"
)

// RegisterDataloaders registers license dataloaders to the shared loaders
// container, each with the entitlement its reads are billed on -- the
// GraphQL counterpart of the single TrackAsync the equivalent REST handler
// fires (see dataloader.Metered).
func RegisterDataloaders(loaders *dataloader.Loaders, queries *db.Queries) {
	// Instance.license -- the traversal REST bills as GET /licenses/{id}.
	loaders.Register(LicenseLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(loaders, dogfooding.LicenseReadEntitlementSlug, newLicenseBatchFn(queries)),
	))
	// License.family -- not metered: the family is part of what a license is,
	// not a separate resource, and the read of the license it hangs off is
	// already billed, by the root resolver or by LicenseLoader. Metering it on
	// the license-read slug as well would bill one read twice.
	loaders.Register(LicenseFamilyLoaderName, dataloaderLib.NewBatchedLoader(
		newLicenseFamilyBatchFn(queries),
	))
	// License.entitlements -- what GET /licenses/{slug}/entitlements bills.
	loaders.Register(LicenseEntitlementsLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(loaders, dogfooding.LicenseEntitlementReadEntitlementSlug, newLicenseEntitlementsBatchFn(queries)),
	))
}

func newLicenseBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, db.License] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[db.License] {
		results := make([]*dataloaderLib.Result[db.License], len(keys))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[db.License]{Error: err}
			}
			return results
		}

		licenses, err := queries.GetLicensesByIDs(ctx, db.GetLicensesByIDsParams{
			OrganizationID: organizationID,
			LicenseIds:     keys,
		})
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[db.License]{Error: err}
			}
			return results
		}

		// Rows are indexed as they came back, not rebuilt field by field. The
		// copy this replaces silently dropped is_default, created_at and
		// updated_at, and would have dropped family_id too -- so
		// Instance.license { family } would have resolved against a nil UUID
		// while the same query one level up resolved correctly.
		licenseMap := make(map[uuid.UUID]db.License, len(licenses))
		for _, l := range licenses {
			licenseMap[l.ID] = l
		}

		// Map results in order of keys
		for i, key := range keys {
			if license, ok := licenseMap[key]; ok {
				results[i] = &dataloaderLib.Result[db.License]{Data: license}
			} else {
				results[i] = &dataloaderLib.Result[db.License]{Error: dataloader.ErrNotFound}
			}
		}

		return results
	}
}

// newLicenseFamilyBatchFn loads license families by id, which is how
// License.family resolves: family_id is already on the license row, so the
// families of every license in a response are fetched in one query instead of
// one per license.
func newLicenseFamilyBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, db.LicenseFamily] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[db.LicenseFamily] {
		results := make([]*dataloaderLib.Result[db.LicenseFamily], len(keys))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[db.LicenseFamily]{Error: err}
			}
			return results
		}

		families, err := queries.GetLicenseFamiliesByIDs(ctx, db.GetLicenseFamiliesByIDsParams{
			OrganizationID: organizationID,
			FamilyIds:      keys,
		})
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[db.LicenseFamily]{Error: err}
			}
			return results
		}

		familyMap := make(map[uuid.UUID]db.LicenseFamily, len(families))
		for _, f := range families {
			familyMap[f.ID] = f
		}

		for i, key := range keys {
			if family, ok := familyMap[key]; ok {
				results[i] = &dataloaderLib.Result[db.LicenseFamily]{Data: family}
			} else {
				results[i] = &dataloaderLib.Result[db.LicenseFamily]{Error: dataloader.ErrNotFound}
			}
		}

		return results
	}
}

func getOrganizationID(ctx context.Context) (uuid.UUID, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return uuid.UUID{}, dataloader.ErrMissingIdentity
	}

	return i.OrganizationID, nil
}

// GetLicenseLoader retrieves the license loader from context.
func GetLicenseLoader(ctx context.Context) (*dataloaderLib.Loader[uuid.UUID, db.License], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[uuid.UUID, db.License](loaders, LicenseLoaderName)
}

// GetLicenseFamilyLoader retrieves the license family loader from context.
func GetLicenseFamilyLoader(ctx context.Context) (*dataloaderLib.Loader[uuid.UUID, db.LicenseFamily], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[uuid.UUID, db.LicenseFamily](loaders, LicenseFamilyLoaderName)
}
