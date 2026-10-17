package assignaddonentitlement

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "AssignAddonEntitlement"

// NewAddonGrant is a grant to add to an add-on version.
type NewAddonGrant struct {
	EntitlementSlug string `json:"entitlementSlug" example:"seats"`
	catalogue.AddonGrant
}

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute grants the entitlement per unit of the version.
func (u *UseCase) Execute(ctx context.Context, addonSlug string, command NewAddonGrant) (*catalogue.AddonEntitlement, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var grant catalogue.AddonEntitlement
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		locked, err := catalogue.Lock(ctx, q, user.OrganizationID, addonSlug, operation+".AddonNotFound")
		if err != nil {
			return err
		}
		if err := catalogue.RefuseBilled(ctx, q, operation, user.OrganizationID, locked.Row.ID); err != nil {
			return err
		}
		entitlement, err := catalogue.Entitlement(ctx, q, user.OrganizationID, command.EntitlementSlug, operation+".EntitlementNotFound")
		if err != nil {
			return err
		}
		value, percent, behavior, err := command.Normalize(operation, entitlement.Type)
		if err != nil {
			return err
		}
		_, err = q.InsertAddonEntitlement(ctx, db.InsertAddonEntitlementParams{
			OrganizationID: user.OrganizationID, AddonID: locked.Row.ID, EntitlementID: entitlement.ID, Value: value,
			OveragePercent: percent, OverrideBehavior: behavior, UserID: user.ID,
		})
		if kaitenerrors.IsUniqueViolationOnConstraint(err, "addon_entitlement_addon_id_entitlement_id_key") {
			return kaitenerrors.Conflict(operation+".AlreadyAssigned", "the add-on version already grants this entitlement")
		}
		if err != nil {
			return err
		}
		row, err := catalogue.LockedGrant(ctx, q, user.OrganizationID, locked.Row.ID, command.EntitlementSlug, operation+".EntitlementNotFound")
		if err != nil {
			return err
		}
		grant = catalogue.ToGrant(row)
		return u.outbox.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID,
			events.AddonEntitlementAssigned.Name, events.AddonEntitlementAssigned.Type,
			catalogue.AddonGrantUpdate{AddonEntitlement: grant, AddonSlug: addonSlug}, nil))
	})
	if err != nil {
		return nil, err
	}
	return &grant, nil
}
