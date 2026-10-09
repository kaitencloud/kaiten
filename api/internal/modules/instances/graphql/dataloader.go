package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/effectivelookup"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/getentitlementsusagemetrics"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/instances/schema"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// Dataloader names
const (
	InstanceLoaderName             = "InstanceLoader"
	InstancesByCustomerLoaderName  = "InstancesByCustomerLoader"
	InstancesByLicenseLoaderName   = "InstancesByLicenseLoader"
	InstanceIntegrationsLoaderName = "InstanceIntegrationsLoader"
	EntitlementUsageLoaderName     = "EntitlementUsageLoader"
)

// RegisterDataloaders registers instance dataloaders to the shared loaders
// container, each with the entitlement its reads are billed on -- the
// GraphQL counterpart of the single TrackAsync the equivalent REST handler
// fires (see dataloader.Metered).
func RegisterDataloaders(loaders *dataloader.Loaders, queries *db.Queries) {
	// Customer.instances / License.instances -- the traversals REST bills as
	// a GET /instances list.
	loaders.Register(InstancesByCustomerLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(loaders, dogfooding.InstanceReadEntitlementSlug, newInstancesByCustomerBatchFn(queries)),
	))
	loaders.Register(InstancesByLicenseLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(loaders, dogfooding.InstanceReadEntitlementSlug, newInstancesByLicenseBatchFn(queries)),
	))
	// Instance.integrations is a projection of the instance row whose read
	// was already billed: GET /instances returns integrations inline in the
	// same response, for the same one instances-read. Unmetered on purpose.
	loaders.Register(InstanceIntegrationsLoaderName, dataloaderLib.NewBatchedLoader(
		newInstanceIntegrationsBatchFn(queries),
	))
	// Instance.entitlementUsage -- what GET /instances/{slug}/entitlements
	// bills as entitlement-values-checked.
	loaders.Register(EntitlementUsageLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(loaders, dogfooding.EntitlementValuesCheckedEntitlementSlug, newEntitlementUsageBatchFn(queries)),
	))
}

// newEntitlementUsageBatchFn loads an instance's entitlement usage (one row
// per license grant, zero-defaulted) by instance ID. The fallback query is
// single-instance, so the batch iterates keys — still one SQL round-trip per
// instance server-side.

func newEntitlementUsageBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, []schema.EntitlementUsage] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]schema.EntitlementUsage] {
		results := make([]*dataloaderLib.Result[[]schema.EntitlementUsage], len(keys))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]schema.EntitlementUsage]{Error: err}
			}
			return results
		}

		for i, instanceID := range keys {
			done := effectivelookup.Time(ctx, effectivelookup.ReaderGraphQL)
			rows, err := queries.GetEntitlementsUsageForInstanceWithFallback(ctx, db.GetEntitlementsUsageForInstanceWithFallbackParams{
				OrganizationID: organizationID,
				InstanceID:     instanceID,
			})
			done()
			if err != nil {
				results[i] = &dataloaderLib.Result[[]schema.EntitlementUsage]{Error: err}
				continue
			}

			// now (database time) comes from rows[0].Now -- folded
			// into GetEntitlementsUsageForInstanceWithFallback itself rather
			// than a separate GetDatabaseNow round trip per batch.
			usage, err := getentitlementsusagemetrics.MapUsageRows(rows)
			if err != nil {
				results[i] = &dataloaderLib.Result[[]schema.EntitlementUsage]{Error: err}
				continue
			}
			results[i] = &dataloaderLib.Result[[]schema.EntitlementUsage]{Data: usage}
		}
		return results
	}
}

func newInstancesByCustomerBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, []db.GetInstancesByCustomerIDsRow] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]db.GetInstancesByCustomerIDsRow] {
		results := make([]*dataloaderLib.Result[[]db.GetInstancesByCustomerIDsRow], len(keys))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]db.GetInstancesByCustomerIDsRow]{Error: err}
			}
			return results
		}

		instances, err := queries.GetInstancesByCustomerIDs(ctx, db.GetInstancesByCustomerIDsParams{
			OrganizationID: organizationID,
			CustomerIds:    keys,
		})
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]db.GetInstancesByCustomerIDsRow]{Error: err}
			}
			return results
		}

		// Group instances by customer ID
		instanceMap := make(map[uuid.UUID][]db.GetInstancesByCustomerIDsRow)
		for _, inst := range instances {
			instanceMap[inst.CustomerID] = append(instanceMap[inst.CustomerID], inst)
		}

		// Map results in order of keys
		for i, key := range keys {
			if insts, ok := instanceMap[key]; ok {
				results[i] = &dataloaderLib.Result[[]db.GetInstancesByCustomerIDsRow]{Data: insts}
			} else {
				results[i] = &dataloaderLib.Result[[]db.GetInstancesByCustomerIDsRow]{Data: []db.GetInstancesByCustomerIDsRow{}}
			}
		}

		return results
	}
}

func newInstancesByLicenseBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, []db.GetInstancesByLicenseIDsRow] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]db.GetInstancesByLicenseIDsRow] {
		results := make([]*dataloaderLib.Result[[]db.GetInstancesByLicenseIDsRow], len(keys))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]db.GetInstancesByLicenseIDsRow]{Error: err}
			}
			return results
		}

		instances, err := queries.GetInstancesByLicenseIDs(ctx, db.GetInstancesByLicenseIDsParams{
			OrganizationID: organizationID,
			LicenseIds:     keys,
		})
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]db.GetInstancesByLicenseIDsRow]{Error: err}
			}
			return results
		}

		// Group instances by license ID
		instanceMap := make(map[uuid.UUID][]db.GetInstancesByLicenseIDsRow)
		for _, inst := range instances {
			instanceMap[inst.LicenseID] = append(instanceMap[inst.LicenseID], inst)
		}

		// Map results in order of keys
		for i, key := range keys {
			if insts, ok := instanceMap[key]; ok {
				results[i] = &dataloaderLib.Result[[]db.GetInstancesByLicenseIDsRow]{Data: insts}
			} else {
				results[i] = &dataloaderLib.Result[[]db.GetInstancesByLicenseIDsRow]{Data: []db.GetInstancesByLicenseIDsRow{}}
			}
		}

		return results
	}
}

func newInstanceIntegrationsBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, []db.GetInstanceIntegrationsByInstanceIDsRow] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]db.GetInstanceIntegrationsByInstanceIDsRow] {
		results := make([]*dataloaderLib.Result[[]db.GetInstanceIntegrationsByInstanceIDsRow], len(keys))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]db.GetInstanceIntegrationsByInstanceIDsRow]{Error: err}
			}
			return results
		}

		rows, err := queries.GetInstanceIntegrationsByInstanceIDs(ctx, db.GetInstanceIntegrationsByInstanceIDsParams{
			OrganizationID: organizationID,
			InstanceIds:    keys,
		})
		if err != nil {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]db.GetInstanceIntegrationsByInstanceIDsRow]{Error: err}
			}
			return results
		}

		grouped := make(map[uuid.UUID][]db.GetInstanceIntegrationsByInstanceIDsRow, len(keys))
		for _, key := range keys {
			grouped[key] = []db.GetInstanceIntegrationsByInstanceIDsRow{}
		}

		for _, row := range rows {
			grouped[row.InstanceID] = append(grouped[row.InstanceID], row)
		}

		for i, key := range keys {
			results[i] = &dataloaderLib.Result[[]db.GetInstanceIntegrationsByInstanceIDsRow]{
				Data: grouped[key],
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

// GetInstancesByCustomerLoader retrieves the instances by customer loader from context.
func GetInstancesByCustomerLoader(ctx context.Context) (*dataloaderLib.Loader[uuid.UUID, []db.GetInstancesByCustomerIDsRow], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[uuid.UUID, []db.GetInstancesByCustomerIDsRow](loaders, InstancesByCustomerLoaderName)
}

// GetInstancesByLicenseLoader retrieves the instances by license loader from context.
func GetInstancesByLicenseLoader(ctx context.Context) (*dataloaderLib.Loader[uuid.UUID, []db.GetInstancesByLicenseIDsRow], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[uuid.UUID, []db.GetInstancesByLicenseIDsRow](loaders, InstancesByLicenseLoaderName)
}

// GetInstanceIntegrationsLoader retrieves the instance integrations loader from context.
func GetInstanceIntegrationsLoader(ctx context.Context) (*dataloaderLib.Loader[uuid.UUID, []db.GetInstanceIntegrationsByInstanceIDsRow], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[uuid.UUID, []db.GetInstanceIntegrationsByInstanceIDsRow](loaders, InstanceIntegrationsLoaderName)
}

// GetEntitlementUsageLoader retrieves the entitlement usage loader from context.
func GetEntitlementUsageLoader(ctx context.Context) (*dataloaderLib.Loader[uuid.UUID, []schema.EntitlementUsage], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[uuid.UUID, []schema.EntitlementUsage](loaders, EntitlementUsageLoaderName)
}
