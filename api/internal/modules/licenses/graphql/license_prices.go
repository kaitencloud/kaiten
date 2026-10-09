package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
)

// LicensePricesLoaderName loads a licence version's prices, for License.prices.
const LicensePricesLoaderName = "LicensePricesLoader"

// newLicensePricesBatchFn reads each version's prices, every status, in
// display order -- what GET /licenses/{slug}/prices answers.
func newLicensePricesBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, []prices.Price] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]prices.Price] {
		results := make([]*dataloaderLib.Result[[]prices.Price], len(keys))
		organizationID, err := getOrganizationID(ctx)
		for i, licenseID := range keys {
			if err != nil {
				results[i] = &dataloaderLib.Result[[]prices.Price]{Error: err}
				continue
			}
			list, listErr := prices.List(ctx, queries, organizationID, licenseID, "", "")
			results[i] = &dataloaderLib.Result[[]prices.Price]{Data: list, Error: listErr}
		}
		return results
	}
}

// LoadLicensePrices is a version's prices, narrowed to status when it is set.
func LoadLicensePrices(ctx context.Context, licenseID uuid.UUID, status *string) ([]prices.Price, error) {
	loader, err := dataloader.GetLoader[uuid.UUID, []prices.Price](dataloader.LoadersFromContext(ctx), LicensePricesLoaderName)
	if err != nil {
		return nil, err
	}
	all, err := loader.Load(ctx, licenseID)()
	if err != nil {
		return nil, err
	}
	out := make([]prices.Price, 0, len(all))
	for _, price := range all {
		if status == nil || *status == "" || price.Status == *status {
			out = append(out, price)
		}
	}
	return out, nil
}
