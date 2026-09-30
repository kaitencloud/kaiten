package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/dogfooding"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/deploymentzones/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

const (
	DeploymentZoneLoaderName = "DeploymentZoneLoader"
)

// RegisterDataloaders registers deployment zone dataloaders to the shared
// loaders container, each with the entitlement its reads are billed on -- the
// GraphQL counterpart of the single TrackAsync the equivalent REST handler
// fires (see dataloader.Metered).
func RegisterDataloaders(loaders *dataloader.Loaders, queries *db.Queries) {
	// Instance.deploymentZone -- the traversal REST bills as
	// GET /deployment-zones/{id}.
	loaders.Register(DeploymentZoneLoaderName, dataloaderLib.NewBatchedLoader(
		dataloader.Metered(loaders, dogfooding.DeploymentZoneReadEntitlementSlug, newDeploymentZoneBatchFn(queries)),
	))
}

func newDeploymentZoneBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, db.GetDeploymentZonesByIDsRow] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[db.GetDeploymentZonesByIDsRow] {
		results := make([]*dataloaderLib.Result[db.GetDeploymentZonesByIDsRow], len(keys))

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			return fillDeploymentZoneErrors(results, err)
		}

		rows, err := queries.GetDeploymentZonesByIDs(ctx, db.GetDeploymentZonesByIDsParams{
			OrganizationID:    organizationID,
			DeploymentZoneIds: keys,
		})
		if err != nil {
			return fillDeploymentZoneErrors(results, err)
		}

		zoneMap := make(map[uuid.UUID]db.GetDeploymentZonesByIDsRow, len(rows))
		for _, row := range rows {
			zoneMap[row.ID] = row
		}

		for i, key := range keys {
			if row, ok := zoneMap[key]; ok {
				results[i] = &dataloaderLib.Result[db.GetDeploymentZonesByIDsRow]{Data: row}
			} else {
				results[i] = &dataloaderLib.Result[db.GetDeploymentZonesByIDsRow]{Error: dataloader.ErrNotFound}
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

func fillDeploymentZoneErrors(results []*dataloaderLib.Result[db.GetDeploymentZonesByIDsRow], err error) []*dataloaderLib.Result[db.GetDeploymentZonesByIDsRow] {
	for i := range results {
		results[i] = &dataloaderLib.Result[db.GetDeploymentZonesByIDsRow]{Error: err}
	}
	return results
}

// GetDeploymentZoneLoader retrieves the deployment zone loader from context.
func GetDeploymentZoneLoader(ctx context.Context) (*dataloaderLib.Loader[uuid.UUID, db.GetDeploymentZonesByIDsRow], error) {
	loaders := dataloader.LoadersFromContext(ctx)
	return dataloader.GetLoader[uuid.UUID, db.GetDeploymentZonesByIDsRow](loaders, DeploymentZoneLoaderName)
}
