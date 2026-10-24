package unassignaddonentitlement

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UnassignAddonEntitlement"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute removes the grant.
func (u *UseCase) Execute(ctx context.Context, addonSlug, entitlementSlug string) error {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return err
	}
	return u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		locked, err := catalogue.Lock(ctx, q, user.OrganizationID, addonSlug, operation+".NotFound")
		if err != nil {
			return err
		}
		existing, err := catalogue.LockedGrant(ctx, q, user.OrganizationID, locked.Row.ID, entitlementSlug, operation+".NotFound")
		if err != nil {
			return err
		}
		if err := catalogue.RefuseBilled(ctx, q, operation, user.OrganizationID, locked.Row.ID); err != nil {
			return err
		}
		metered, err := q.EntitlementMeteredByAddonPrice(ctx, db.EntitlementMeteredByAddonPriceParams{
			AddonID: locked.Row.ID, EntitlementID: &existing.EntitlementID,
		})
		if err != nil {
			return err
		}
		if metered {
			return kaitenerrors.Conflict(operation+".MeteredByPrice",
				"an active price of this add-on version meters this entitlement: deprecate it first")
		}
		if err := q.DeleteAddonEntitlement(ctx, db.DeleteAddonEntitlementParams{OrganizationID: user.OrganizationID, ID: existing.ID}); err != nil {
			return err
		}
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
			events.AddonEntitlementUnassigned.Name, events.AddonEntitlementUnassigned.Type,
			catalogue.AddonGrantUpdate{AddonEntitlement: catalogue.ToGrant(existing), AddonSlug: addonSlug}, nil))
	})
}
