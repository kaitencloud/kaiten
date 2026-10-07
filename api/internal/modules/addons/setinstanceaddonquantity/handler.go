package setinstanceaddonquantity

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
)

const operation = "SetInstanceAddonQuantity"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute changes the quantity. Repeating the current one changes nothing and
// records nothing.
func (u *UseCase) Execute(ctx context.Context, instanceSlug, addonSlug string, quantity int32) (*catalogue.InstanceAddon, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var attached catalogue.InstanceAddon
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		write, err := catalogue.LockAttachment(ctx, q, user.OrganizationID, instanceSlug, addonSlug, operation)
		if err != nil {
			return err
		}
		if err := catalogue.ValidateQuantity(operation, quantity, write.Attachment.MaxQuantity); err != nil {
			return err
		}
		previous := write.Attachment.Quantity
		if previous == quantity {
			id := write.Attachment.ID
			list, err := catalogue.InstanceAddons(ctx, q, user.OrganizationID, write.Instance.ID, write.Subscription, false, &id)
			if err != nil {
				return err
			}
			attached = list[0]
			return nil
		}
		if err := q.SetInstanceAddonQuantity(ctx, db.SetInstanceAddonQuantityParams{
			Quantity: quantity, UserID: user.ID, OrganizationID: user.OrganizationID, ID: write.Attachment.ID,
		}); err != nil {
			return err
		}
		attached, err = catalogue.AnnounceAttachment(ctx, q, u.outbox, user.OrganizationID, instanceSlug, write,
			events.InstanceAddonQuantityChanged, &previous)
		return err
	})
	if err != nil {
		return nil, err
	}
	return &attached, nil
}
