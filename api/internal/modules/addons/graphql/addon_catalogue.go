package graphql

import (
	"context"

	"github.com/google/uuid"
	dataloaderLib "github.com/graph-gophers/dataloader/v7"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/billing/gate"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/http/graphql/dataloader"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	"github.com/kaitencloud/kaiten/api/internal/platform/principal"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

// AddonPricesLoaderName loads a version's prices, for Addon.prices.
const AddonPricesLoaderName = "AddonPricesLoader"

// AddonPage is a cursor-paginated page of add-on versions, the model of the
// schema's AddonPage.
type AddonPage struct {
	Items      []catalogue.Addon
	NextCursor *string
	HasMore    bool
}

// GetAddons returns a page of the organization's add-on versions, newest first:
// what GET /addons answers, refused as it is refused where the organization
// may not reach billing. The gate is checked here, at the only field that
// reaches an Addon, so that no add-on is read for an organization it keeps out.
func GetAddons(ctx context.Context, queries *db.Queries, billing gate.Gate, limit int32, cursor *string) (*AddonPage, error) {
	i, ok := principal.FromContext(ctx)
	if !ok {
		return nil, dataloader.ErrMissingIdentity
	}
	if err := billing.Require(ctx, i.OrganizationID); err != nil {
		return nil, err
	}

	raw := ""
	if cursor != nil {
		raw = *cursor
	}
	keyset, err := pagination.ParseKeyset(raw, limit, "Addons")
	if err != nil {
		return nil, err
	}
	page, err := catalogue.List(ctx, queries, i.OrganizationID, "", "", keyset)
	if err != nil {
		return nil, err
	}

	return &AddonPage{Items: page.Items, NextCursor: page.NextCursor, HasMore: page.HasMore}, nil
}

// newAddonPricesBatchFn reads the prices of every version a batch names in one
// statement, every status, in display order -- what GET
// /addons/{slug}/prices answers for each of them.
func newAddonPricesBatchFn(queries *db.Queries) dataloaderLib.BatchFunc[uuid.UUID, []prices.Price] {
	return func(ctx context.Context, keys []uuid.UUID) []*dataloaderLib.Result[[]prices.Price] {
		results := make([]*dataloaderLib.Result[[]prices.Price], len(keys))
		fail := func(err error) []*dataloaderLib.Result[[]prices.Price] {
			for i := range results {
				results[i] = &dataloaderLib.Result[[]prices.Price]{Error: err}
			}
			return results
		}

		i, ok := principal.FromContext(ctx)
		if !ok {
			return fail(dataloader.ErrMissingIdentity)
		}
		byAddon, err := catalogue.Prices(ctx, queries, i.OrganizationID, keys, nil)
		if err != nil {
			return fail(err)
		}
		for n, key := range keys {
			list := byAddon[key]
			if list == nil {
				list = []prices.Price{}
			}
			results[n] = &dataloaderLib.Result[[]prices.Price]{Data: list}
		}
		return results
	}
}

// LoadAddonPrices is a version's prices, narrowed to status when it is set. A status
// that is neither ACTIVE nor DEPRECATED is refused, as GET .../prices refuses it.
func LoadAddonPrices(ctx context.Context, addonID uuid.UUID, status *string) ([]prices.Price, error) {
	if err := prices.CheckStatusFilter(status); err != nil {
		return nil, err
	}
	loader, err := dataloader.GetLoader[uuid.UUID, []prices.Price](dataloader.LoadersFromContext(ctx), AddonPricesLoaderName)
	if err != nil {
		return nil, err
	}
	all, err := loader.Load(ctx, addonID)()
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
