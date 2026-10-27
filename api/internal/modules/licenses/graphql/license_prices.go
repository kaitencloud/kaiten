package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/shared/aiusage"
)

// LicensePricesLoaderName loads a licence version's prices, for License.prices.
const LicensePricesLoaderName = "LicensePricesLoader"

// newLicensePricesBatchFn reads the prices of every version a batch names in
// one statement, every status, in display order -- what GET
// /licenses/{slug}/prices answers for each of them. A page of 200 versions is
// one query here, not 200.
func newLicensePricesBatchFn(queries *db.Queries, policy aiusage.Policy) dataloaderLib.BatchFunc[uuid.UUID, []prices.Price] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]prices.Price] {
		results := make([]*dataloaderLib.Result[[]prices.Price], len(keys))
		fail := func(err error) []*dataloaderLib.Result[[]prices.Price] {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]prices.Price]{Error: err}
			}
			return results
		}

		organizationID, err := getOrganizationID(ctx)
		if err != nil {
			return fail(err)
		}
		byLicense, err := prices.ListForLicensesOperational(ctx, queries, organizationID, keys, !policy.Enabled(ctx))
		if err != nil {
			return fail(err)
		}
		for i, licenseID := range keys {
			list := byLicense[licenseID]
			if list == nil {
				list = []prices.Price{}
			}
			results[i] = &dataloaderLib.Result[[]prices.Price]{Data: list}
		}
		return results
	}
}

// LoadLicensePrices is a version's prices, narrowed to status when it is set. GraphQL
// validates status against the PriceStatus enum before any resolver runs.
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
