package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/customers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

const (
	CustomerLoaderName             = "CustomerLoader"
	CustomerIntegrationsLoaderName = "CustomerIntegrationsLoader"
)

// RegisterDataloaders registers customer dataloaders to the shared loaders
// container, each with the entitlement its reads are billed on -- the
// GraphQL counterpart of the single TrackAsync the equivalent REST handler
// fires (see dataloader.Metered).
func RegisterDataloaders(loaders *dataloader.Loaders, queries *db.Queries) {
	// Instance.customer -- the traversal REST bills as GET /customers/{id}.
	loaders.Register(CustomerLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(loaders, dogfooding.CustomerReadEntitlementSlug, newCustomerBatchFn(queries)),
	))
	// Customer.integrations is a projection of the customer row whose read
	// was already billed: GET /customers returns integrations inline in the
	// same response, for the same one customers-read. Unmetered on purpose.
	loaders.Register(CustomerIntegrationsLoaderName, dataloaderLib.NewBatchedLoader(
		newCustomerIntegrationsBatchFn(queries),
	))
}

func newCustomerBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, db.GetCustomersByIDsRow] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[db.GetCustomersByIDsRow] {
		results := make([]*dataloaderLib.Result[db.GetCustomersByIDsRow], len(keys))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			return fillCustomerErrors(results, err)
		}

		customers, err := queries.GetCustomersByIDs(ctx, db.GetCustomersByIDsParams{
			OrganizationID: organizationID,
			CustomerIds:    keys,
		})
		if err != nil {
			return fillCustomerErrors(results, err)
		}

		// Build lookup map
		customerMap := make(map[uuid.UUID]db.GetCustomersByIDsRow, len(customers))
		for _, c := range customers {
			customerMap[c.ID] = c
		}

		// Map results in order of keys
		for i, key := range keys {
			if customer, ok := customerMap[key]; ok {
				results[i] = &dataloaderLib.Result[db.GetCustomersByIDsRow]{Data: customer}
			} else {
				results[i] = &dataloaderLib.Result[db.GetCustomersByIDsRow]{Error: dataloader.ErrNotFound}
			}
		}

		return results
	}
}

func newCustomerIntegrationsBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, []db.GetCustomerIntegrationsByCustomerIDsRow] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]db.GetCustomerIntegrationsByCustomerIDsRow] {
		results := make([]*dataloaderLib.Result[[]db.GetCustomerIntegrationsByCustomerIDsRow], len(keys))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			return fillCustomerIntegrationErrors(results, err)
		}

		rows, err := queries.GetCustomerIntegrationsByCustomerIDs(ctx, db.GetCustomerIntegrationsByCustomerIDsParams{
			OrganizationID: organizationID,
			CustomerIds:    keys,
		})
		if err != nil {
			return fillCustomerIntegrationErrors(results, err)
		}

		grouped := make(map[uuid.UUID][]db.GetCustomerIntegrationsByCustomerIDsRow, len(keys))
		for _, key := range keys {
			grouped[key] = []db.GetCustomerIntegrationsByCustomerIDsRow{}
		}

		for _, row := range rows {
			grouped[row.CustomerID] = append(grouped[row.CustomerID], row)
		}

		for i, key := range keys {
			results[i] = &dataloaderLib.Result[[]db.GetCustomerIntegrationsByCustomerIDsRow]{
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

func fillCustomerErrors(results []*dataloaderLib.Result[db.GetCustomersByIDsRow], err error) []*dataloaderLib.Result[db.GetCustomersByIDsRow] {
	for i := range results {
		results[i] = &dataloaderLib.Result[db.GetCustomersByIDsRow]{Error: err}
	}
	return results
}

func fillCustomerIntegrationErrors(results []*dataloaderLib.Result[[]db.GetCustomerIntegrationsByCustomerIDsRow], err error) []*dataloaderLib.Result[[]db.GetCustomerIntegrationsByCustomerIDsRow] {
	for i := range results {
		results[i] = &dataloaderLib.Result[[]db.GetCustomerIntegrationsByCustomerIDsRow]{Error: err}
	}
	return results
}

// GetCustomerLoader retrieves the customer loader from context.
func GetCustomerLoader(ctx context.Context) (*dataloaderLib.Loader[uuid.UUID, db.GetCustomersByIDsRow], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[uuid.UUID, db.GetCustomersByIDsRow](loaders, CustomerLoaderName)
}

// GetCustomerIntegrationsLoader retrieves the customer integrations loader from context.
func GetCustomerIntegrationsLoader(ctx context.Context) (*dataloaderLib.Loader[uuid.UUID, []db.GetCustomerIntegrationsByCustomerIDsRow], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[uuid.UUID, []db.GetCustomerIntegrationsByCustomerIDsRow](loaders, CustomerIntegrationsLoaderName)
}
