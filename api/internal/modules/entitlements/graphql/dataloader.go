package graphql

import (
	"context"

	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/entitlements/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// Dataloader names
const (
	EntitlementBySlugLoaderName = "EntitlementBySlugLoader"
)

// RegisterDataloaders registers entitlement dataloaders to the shared loaders
// container, each with the entitlement its reads are billed on -- the
// GraphQL counterpart of the single TrackAsync the equivalent REST handler
// fires (see dataloader.Metered).
func RegisterDataloaders(loaders *dataloader.Loaders, queries *db.Queries) {
	// LicenseEntitlement.entitlement -- the traversal REST bills as
	// GET /entitlements/{slug}.
	loaders.Register(EntitlementBySlugLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(loaders, dogfooding.EntitlementReadEntitlementSlug, newEntitlementBySlugBatchFn(queries)),
	))
}

// newEntitlementBySlugBatchFn resolves full entitlement definitions (groups
// included) by slug. The batch loads the organization's whole catalog once per
// request — the same cost as the REST list endpoint — so N
// LicenseEntitlement.entitlement fields resolve with two queries total.
func newEntitlementBySlugBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[string, schema.Entitlement] {
	return func(ctx context.Context, keys []string) []*dataloaderLib.Result[schema.Entitlement] {
		results := make([]*dataloaderLib.Result[schema.Entitlement], len(keys))

		fail := func(err error) []*dataloaderLib.Result[schema.Entitlement] {
			for i := range results {
				results[i] = &dataloaderLib.Result[schema.Entitlement]{Error: err}
			}
			return results
		}

		identity, ok := principal.FromContext(ctx)
		if !ok {
			return fail(ErrMissingIdentity)
		}

		entitlements, err := queries.GetEntitlements(ctx, identity.OrganizationID)
		if err != nil {
			return fail(err)
		}

		groupRows, err := queries.GetEntitlementGroupsForOrganizationEntitlements(ctx, identity.OrganizationID)
		if err != nil {
			return fail(err)
		}
		groups := groupsBySlug(groupRows)

		bySlug := make(map[string]schema.Entitlement, len(entitlements))
		for _, e := range entitlements {
			bySlug[e.Slug] = toEntitlementSchema(e, groups[e.Slug])
		}

		for i, key := range keys {
			if entitlement, found := bySlug[key]; found {
				results[i] = &dataloaderLib.Result[schema.Entitlement]{Data: entitlement}
			} else {
				results[i] = &dataloaderLib.Result[schema.Entitlement]{Error: dataloader.ErrNotFound}
			}
		}
		return results
	}
}

// GetEntitlementBySlugLoader retrieves the entitlement-by-slug loader from context.
func GetEntitlementBySlugLoader(ctx context.Context) (*dataloaderLib.Loader[string, schema.Entitlement], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[string, schema.Entitlement](loaders, EntitlementBySlugLoaderName)
}
