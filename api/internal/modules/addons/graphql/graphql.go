// Package graphql is the add-ons module's part of the GraphQL schema (§13.14):
// the add-ons an instance holds.
package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
)

// InstanceAddonsLoaderName loads Instance.addons.
const InstanceAddonsLoaderName = "InstanceAddonsLoader"

// RegisterDataloaders registers the add-ons module's loaders.
func RegisterDataloaders(loaders *dataloader.Loaders, queries *db.Queries) {
	loaders.Register(InstanceAddonsLoaderName, dataloaderLib.NewBatchedLoader(newInstanceAddonsBatchFn(queries)))
}

func newInstanceAddonsBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, []catalogue.InstanceAddon] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]catalogue.InstanceAddon] {
		results := make([]*dataloaderLib.Result[[]catalogue.InstanceAddon], len(keys))
		fail := func(err error) []*dataloaderLib.Result[[]catalogue.InstanceAddon] {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]catalogue.InstanceAddon]{Error: err}
			}
			return results
		}
		i, ok := principal.FromContext(ctx)
		if !ok {
			return fail(dataloader.ErrMissingIdentity)
		}
		rows, err := queries.ListActiveInstanceAddonsByInstances(ctx, db.ListActiveInstanceAddonsByInstancesParams{
			OrganizationID: i.OrganizationID, InstanceIds: keys,
		})
		if err != nil {
			return fail(err)
		}
		byInstance := map[uuid.UUID][]catalogue.InstanceAddon{}
		for _, row := range rows {
			byInstance[row.InstanceID] = append(byInstance[row.InstanceID], catalogue.InstanceAddon{
				ID: row.ID, AddonID: row.AddonID, AddonSlug: row.AddonSlug, FamilySlug: row.FamilySlug, Name: row.AddonName,
				Quantity: row.Quantity, MaxQuantity: row.MaxQuantity, AttachedAt: row.CreatedAt.Time.UTC(), RemovedAt: nil, Prices: nil,
			})
		}
		for n, key := range keys {
			list := byInstance[key]
			if list == nil {
				list = []catalogue.InstanceAddon{}
			}
			results[n] = &dataloaderLib.Result[[]catalogue.InstanceAddon]{Data: list}
		}
		return results
	}
}

// LoadInstanceAddons is the add-ons an instance holds now.
func LoadInstanceAddons(ctx context.Context, instanceID uuid.UUID) ([]catalogue.InstanceAddon, error) {
	loader, err := dataloader.GetLoader[uuid.UUID, []catalogue.InstanceAddon](dataloader.LoadersFromContext(ctx), InstanceAddonsLoaderName)
	if err != nil {
		return nil, err
	}
	return loader.Load(ctx, instanceID)()
}
