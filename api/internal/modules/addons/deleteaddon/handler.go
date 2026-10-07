package deleteaddon

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "DeleteAddon"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute deletes a version nothing holds or ever held, and its family with
// its last version. Its prices and compatibility go with it.
func (u *UseCase) Execute(ctx context.Context, slug string) error {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return err
	}
	return u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		locked, err := catalogue.Lock(ctx, q, user.OrganizationID, slug, operation+".NotFound")
		if err != nil {
			return err
		}
		attached, err := q.AddonWasAttached(ctx, db.AddonWasAttachedParams{OrganizationID: user.OrganizationID, AddonID: locked.Row.ID})
		if err != nil {
			return err
		}
		if attached {
			return kaitenerrors.Conflict(operation+".InUseConflict",
				"this add-on version was attached to an instance: it is history and cannot be deleted; archive it instead")
		}
		err = q.DeleteAddon(ctx, db.DeleteAddonParams{OrganizationID: user.OrganizationID, ID: locked.Row.ID})
		if kaitenerrors.IsForeignKeyViolation(err) {
			return kaitenerrors.Conflict(operation+".InUseConflict",
				"this add-on version still grants entitlements: remove its grants first")
		}
		if err != nil {
			return err
		}
		if err := q.DeleteAddonFamilyIfEmpty(ctx, db.DeleteAddonFamilyIfEmptyParams{
			OrganizationID: user.OrganizationID, ID: locked.Row.FamilyID,
		}); err != nil {
			return err
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
			events.AddonDeleted.Name, events.AddonDeleted.Type,
			catalogue.DeletedAddon{ID: locked.Row.ID, Slug: locked.Row.Slug, FamilySlug: locked.FamilySlug}, nil))
	})
}
