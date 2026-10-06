package updateaddonentitlement

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
)

const operation = "UpdateAddonEntitlement"

// AddonGrantChanges replaces a grant's value, behaviour and overage.
type AddonGrantChanges = catalogue.AddonGrant

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute replaces the grant.
func (u *UseCase) Execute(ctx context.Context, addonSlug, entitlementSlug string, command AddonGrantChanges) (*catalogue.AddonEntitlement, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var grant catalogue.AddonEntitlement
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
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
		value, percent, behavior, err := command.Normalize(operation, existing.EntitlementType)
		if err != nil {
			return err
		}
		if err := q.UpdateAddonEntitlement(ctx, db.UpdateAddonEntitlementParams{
			Value: value, OveragePercent: percent, OverrideBehavior: behavior, UserID: user.ID,
			OrganizationID: user.OrganizationID, ID: existing.ID,
		}); err != nil {
			return err
		}
		row, err := catalogue.LockedGrant(ctx, q, user.OrganizationID, locked.Row.ID, entitlementSlug, operation+".NotFound")
		if err != nil {
			return err
		}
		grant = catalogue.ToGrant(row)
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
			events.AddonEntitlementUpdated.Name, events.AddonEntitlementUpdated.Type,
			catalogue.AddonGrantUpdate{AddonEntitlement: grant, AddonSlug: addonSlug}, nil))
	})
	if err != nil {
		return nil, err
	}
	return &grant, nil
}
