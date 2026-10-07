package detachinstanceaddon

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
)

const operation = "DetachInstanceAddon"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute removes the add-on from the instance. The attachment stays, marked
// removed: an invoice and a dispute still need it.
func (u *UseCase) Execute(ctx context.Context, instanceSlug, addonSlug string) error {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return err
	}
	return u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		write, err := catalogue.LockAttachment(ctx, q, user.OrganizationID, instanceSlug, addonSlug, operation)
		if err != nil {
			return err
		}
		if err := q.RemoveInstanceAddon(ctx, db.RemoveInstanceAddonParams{UserID: user.ID, OrganizationID: user.OrganizationID, ID: write.Attachment.ID}); err != nil {
			return err
		}
		_, err = catalogue.AnnounceAttachment(ctx, q, u.outbox, user.OrganizationID, instanceSlug, write, events.InstanceAddonRemoved, nil)
		return err
	})
}
