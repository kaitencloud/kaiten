package attachinstanceaddon

import (
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "AttachInstanceAddon"

// NewInstanceAddon is an add-on to attach.
type NewInstanceAddon struct {
	AddonSlug string `json:"addonSlug" doc:"The add-on version to attach" example:"extra-seats-v1"`
	Quantity  int32  `json:"quantity,omitempty" minimum:"1" default:"1" example:"3"`
}

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute attaches the add-on. The entitlements apply at once; a live
// subscription bills it from its next invoice.
func (u *UseCase) Execute(ctx context.Context, instanceSlug string, command NewInstanceAddon) (*catalogue.InstanceAddon, error) {
	if command.Quantity == 0 {
		command.Quantity = 1
	}
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var attached catalogue.InstanceAddon
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		instance, err := catalogue.LockInstance(ctx, q, user.OrganizationID, instanceSlug, operation)
		if err != nil {
			return err
		}
		addon, err := q.GetAddonBySlug(ctx, db.GetAddonBySlugParams{OrganizationID: user.OrganizationID, Slug: command.AddonSlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf(operation+".AddonNotFound", "add-on %q not found", command.AddonSlug)
		}
		if err != nil {
			return err
		}
		if addon.LifecycleState == db.LicenseLifecycleStateARCHIVED {
			return archived()
		}
		if err := catalogue.ValidateQuantity(operation, command.Quantity, addon.MaxQuantity); err != nil {
			return err
		}
		compatible, err := q.AddonIsCompatible(ctx, db.AddonIsCompatibleParams{AddonID: addon.ID, LicenseFamilyID: instance.LicenseFamilyID})
		if err != nil {
			return err
		}
		if !compatible {
			return kaitenerrors.UnprocessableEntity(operation+".Incompatible", "this add-on version does not fit the instance's licence family")
		}
		sub, err := catalogue.LiveSubscription(ctx, q, user.OrganizationID, instance.ID)
		if err != nil {
			return err
		}
		if err := u.refuseForBilling(ctx, q, addon, instance, sub); err != nil {
			return err
		}
		id, err := q.InsertInstanceAddon(ctx, db.InsertInstanceAddonParams{
			OrganizationID: user.OrganizationID, InstanceID: instance.ID, AddonID: addon.ID, AddonFamilyID: addon.FamilyID,
			Quantity: command.Quantity, UserID: user.ID,
		})
		if kaitenerrors.IsUniqueViolationOnConstraint(err, "instance_addon_instance_id_addon_family_id_active_key") {
			return kaitenerrors.Conflict(operation+".FamilyAlreadyAttached",
				"the instance already holds a version of this add-on: change its quantity, or detach it first")
		}
		if kaitenerrors.IsCheckViolationOnConstraint(err, "instance_addon_not_archived") {
			return archived()
		}
		if err != nil {
			return err
		}
		write := catalogue.AttachmentWrite{Instance: instance, Subscription: sub, Attachment: db.LockActiveInstanceAddonRow{
			ID: id, AddonID: addon.ID, Quantity: command.Quantity, MaxQuantity: addon.MaxQuantity,
		}}
		attached, err = catalogue.AnnounceAttachment(ctx, q, u.outbox, user.OrganizationID, instanceSlug, write, events.InstanceAddonAdded, nil)
		return err
	})
	if err != nil {
		return nil, err
	}
	return &attached, nil
}

// refuseForBilling refuses what a live subscription could not bill: a draft,
// another currency, no price for its period, an entitlement another price
// meters already, or an add-on its scheduled plan would not fit.
func (u *UseCase) refuseForBilling(ctx context.Context, q *db.Queries, addon db.GetAddonBySlugRow, instance db.LockInstanceForAddonsRow, sub *catalogue.Subscription) error {
	if sub == nil {
		return nil
	}
	if err := catalogue.RefuseBoundaryPending(operation, sub); err != nil {
		return err
	}
	if addon.LifecycleState != db.LicenseLifecycleStatePUBLISHED {
		return kaitenerrors.UnprocessableEntity(operation+".AddonNotPublished", "a billed instance takes only a PUBLISHED add-on version")
	}
	if sub.ScheduledFamilyID != nil && *sub.ScheduledFamilyID != instance.LicenseFamilyID {
		fits, err := q.AddonIsCompatible(ctx, db.AddonIsCompatibleParams{AddonID: addon.ID, LicenseFamilyID: *sub.ScheduledFamilyID})
		if err != nil {
			return err
		}
		if !fits {
			return kaitenerrors.UnprocessableEntity(operation+".IncompatibleWithScheduledPlan",
				"this add-on version does not fit the licence family of the scheduled plan change")
		}
	}
	currencies, err := q.AddonCurrencies(ctx, addon.ID)
	if err != nil {
		return err
	}
	if len(currencies) > 0 && !slices.Contains(currencies, sub.Currency) {
		return kaitenerrors.UnprocessableEntityf(operation+".CurrencyMismatch",
			"the add-on is priced in %s and the subscription bills in %s", strings.Join(currencies, ", "), sub.Currency)
	}
	if string(addon.PricingType) == catalogue.PricingPaid {
		priced, err := q.AddonHasDefaultPriceFor(ctx, db.AddonHasDefaultPriceForParams{AddonID: addon.ID, BillingPeriod: sub.BillingPeriod})
		if err != nil {
			return err
		}
		if !priced {
			return kaitenerrors.UnprocessableEntityf(operation+".NoPriceForBillingPeriod",
				"the add-on has no default ACTIVE price for the subscription's %s period", sub.BillingPeriod)
		}
	}
	conflicts, err := q.MeteredEntitlementConflicts(ctx, db.MeteredEntitlementConflictsParams{
		AddonID: addon.ID, LicenseID: instance.LicenseID, InstanceID: instance.ID,
	})
	if err != nil {
		return err
	}
	if len(conflicts) > 0 {
		return kaitenerrors.UnprocessableEntityf(operation+".MeteredEntitlementConflict",
			"another price of the instance already meters %s: one entitlement is billed by one price", strings.Join(conflicts, ", "))
	}
	return nil
}

func archived() error {
	return kaitenerrors.UnprocessableEntity(operation+".AddonArchived", "an archived add-on version cannot be attached")
}
