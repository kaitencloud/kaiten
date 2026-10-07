package listaddonprices

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists a version's prices in display order.
func (u *UseCase) Execute(ctx context.Context, addonSlug, status string) ([]prices.Price, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	addon, err := catalogue.Get(ctx, q, user.OrganizationID, addonSlug, "ListAddonPrices.AddonNotFound")
	if err != nil {
		return nil, err
	}
	var filter *db.PriceStatus
	if status != "" {
		s := db.PriceStatus(status)
		filter = &s
	}
	all, err := catalogue.Prices(ctx, q, user.OrganizationID, []uuid.UUID{addon.ID}, filter)
	if err != nil {
		return nil, err
	}
	if all[addon.ID] == nil {
		return []prices.Price{}, nil
	}
	return all[addon.ID], nil
}
