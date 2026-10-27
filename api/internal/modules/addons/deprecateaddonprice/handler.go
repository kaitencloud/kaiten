package deprecateaddonprice

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/modules/licenses/prices"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "DeprecateAddonPrice"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute stops offering a price. The default price of a period bills every
// instance holding the version, so it cannot be deprecated.
func (u *UseCase) Execute(ctx context.Context, addonSlug string, priceID uuid.UUID) (*prices.Price, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var deprecated prices.Price
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		locked, err := catalogue.Lock(ctx, q, user.OrganizationID, addonSlug, operation+".AddonNotFound")
		if err != nil {
			return err
		}
		price, err := q.LockAddonPrice(ctx, db.LockAddonPriceParams{OrganizationID: user.OrganizationID, AddonID: locked.Row.ID, ID: priceID})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf(operation+".NotFound", "price %s not found", priceID)
		}
		if err != nil {
			return err
		}
		if price.Status == db.PriceStatusDEPRECATED {
			return kaitenerrors.Conflict(operation+".AlreadyDeprecated", "the price is already deprecated")
		}
		if price.IsDefault {
			return kaitenerrors.Conflict(operation+".IsDefault",
				"the default price of a period bills every instance holding this version; retire it through a new add-on version")
		}
		if err := q.DeprecateAddonPrice(ctx, db.DeprecateAddonPriceParams{UserID: user.ID, OrganizationID: user.OrganizationID, ID: priceID}); err != nil {
			return err
		}
		all, err := catalogue.Prices(ctx, q, user.OrganizationID, []uuid.UUID{locked.Row.ID}, nil)
		if err != nil {
			return err
		}
		for _, p := range all[locked.Row.ID] {
			if p.ID == priceID {
				deprecated = p
			}
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
			events.AddonPriceDeprecated.Name, events.AddonPriceDeprecated.Type,
			catalogue.AddonPriceUpdate{Price: deprecated, AddonSlug: addonSlug}, nil))
	})
	if err != nil {
		return nil, err
	}
	return &deprecated, nil
}
