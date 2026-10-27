package setinstanceaddonquantity

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
)

// CustomerChange is what a customer's quantity write did.
type CustomerChange struct {
	Addon catalogue.InstanceAddon
	// Removed is a removal applied at once, on an instance with no live
	// subscription: the attachment is gone.
	Removed bool
}

// SetForCustomer is the quantity a customer sets through the public surface
// (§10.2, §14.4, V31-67). With a live subscription, an increase applies at
// once and cancels a scheduled decrease; a decrease, or 0 for a removal, is
// scheduled for the next boundary in pending_quantity, the attachment keeping
// its quantity, its entitlements and its billing until the close applies it;
// the current quantity cancels a scheduled decrease. Scheduling, replacing or
// cancelling emits quantity_changed, the quantity unchanged. Without a live
// subscription there is no boundary: the write applies at once, 0 removing.
func (u *UseCase) SetForCustomer(ctx context.Context, instanceSlug, addonSlug string, quantity int32) (*CustomerChange, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var out CustomerChange
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		write, err := catalogue.LockAttachment(ctx, q, user.OrganizationID, instanceSlug, addonSlug, operation)
		if err != nil {
			return err
		}
		if err := catalogue.RequireOperational(ctx, q, user.OrganizationID, write.Attachment.AddonID, u.deps.AIPolicy); err != nil {
			return err
		}
		if err := catalogue.RefuseIncomplete(ctx, q, user.OrganizationID, write.Instance.ID, operation); err != nil {
			return err
		}
		if quantity != 0 {
			if err := catalogue.ValidateQuantity(operation, quantity, write.Attachment.MaxQuantity); err != nil {
				return err
			}
		}
		current, pending := write.Attachment.Quantity, write.Attachment.PendingQuantity
		switch {
		case write.Subscription == nil && quantity == 0:
			if err := q.RemoveInstanceAddon(ctx, db.RemoveInstanceAddonParams{UserID: user.ID, OrganizationID: user.OrganizationID, ID: write.Attachment.ID}); err != nil {
				return err
			}
			out.Removed = true
			out.Addon, err = catalogue.AnnounceAttachment(ctx, q, u.outbox, user.OrganizationID, instanceSlug, write, events.InstanceAddonRemoved, nil)
			return err
		case write.Subscription == nil || quantity > current:
			if err := q.SetInstanceAddonQuantity(ctx, db.SetInstanceAddonQuantityParams{
				Quantity: quantity, UserID: user.ID, OrganizationID: user.OrganizationID, ID: write.Attachment.ID,
			}); err != nil {
				return err
			}
			out.Addon, err = catalogue.AnnounceAttachment(ctx, q, u.outbox, user.OrganizationID, instanceSlug, write,
				events.InstanceAddonQuantityChanged, &current)
			return err
		case quantity == current && pending == nil, quantity < current && pending != nil && *pending == quantity:
			id := write.Attachment.ID
			list, err := catalogue.InstanceAddons(ctx, q, user.OrganizationID, write.Instance.ID, write.Subscription, false, &id)
			if err != nil {
				return err
			}
			out.Addon = list[0]
			return nil
		case quantity == current:
			out.Addon, err = u.schedule(ctx, q, user.OrganizationID, user.ID, instanceSlug, write, nil)
			return err
		default:
			out.Addon, err = u.schedule(ctx, q, user.OrganizationID, user.ID, instanceSlug, write, &quantity)
			return err
		}
	})
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// schedule sets or clears the attachment's scheduled decrease and announces
// it: quantity_changed with the quantity unchanged.
func (u *UseCase) schedule(ctx context.Context, q *db.Queries, organizationID, actorID uuid.UUID, instanceSlug string,
	write catalogue.AttachmentWrite, pending *int32,
) (catalogue.InstanceAddon, error) {
	if err := q.SchedulePendingQuantity(ctx, db.SchedulePendingQuantityParams{
		PendingQuantity: pending, UserID: actorID, OrganizationID: organizationID, ID: write.Attachment.ID,
	}); err != nil {
		return catalogue.InstanceAddon{}, err
	}
	current := write.Attachment.Quantity
	return catalogue.AnnounceAttachment(ctx, q, u.outbox, organizationID, instanceSlug, write, events.InstanceAddonQuantityChanged, &current)
}

// ApplyScheduled applies, inside the caller's transaction, the public
// decreases scheduled on the instance's attachments (§10.2, V31-67), at the
// instant given: a boundary, or a cancellation, after which no boundary is
// left to wait for. The quantity becomes the scheduled one, with
// quantity_changed, or the attachment is removed at that instant for 0, with
// removed. A boundary's composition has read the quantities it bills before.
func (u *UseCase) ApplyScheduled(ctx context.Context, organizationID, actorID, instanceID uuid.UUID, at time.Time) error {
	q := u.deps.Queries(ctx)
	scheduled, err := q.LockScheduledInstanceAddons(ctx, db.LockScheduledInstanceAddonsParams{OrganizationID: organizationID, InstanceID: instanceID})
	if err != nil || len(scheduled) == 0 {
		return err
	}
	instance, err := q.LockInstanceForAddonsByID(ctx, db.LockInstanceForAddonsByIDParams{OrganizationID: organizationID, ID: instanceID})
	if err != nil {
		return err
	}
	sub, err := catalogue.LiveSubscription(ctx, q, organizationID, instanceID)
	if err != nil {
		return err
	}
	locked := db.LockInstanceForAddonsRow{ID: instance.ID, LicenseID: instance.LicenseID, LicenseFamilyID: instance.LicenseFamilyID}
	boundary := pgtype.Timestamp{Time: at.UTC(), InfinityModifier: pgtype.Finite, Valid: true}
	for _, row := range scheduled {
		if err := q.ApplyPendingQuantity(ctx, db.ApplyPendingQuantityParams{
			At: boundary, UserID: actorID, OrganizationID: organizationID, ID: row.ID,
		}); err != nil {
			return err
		}
		write := catalogue.AttachmentWrite{Instance: locked, Subscription: sub, Attachment: db.LockActiveInstanceAddonRow(row)}
		event, previous := events.InstanceAddonQuantityChanged, &write.Attachment.Quantity
		if *row.PendingQuantity == 0 {
			event, previous = events.InstanceAddonRemoved, nil
		}
		if _, err := catalogue.AnnounceAttachment(ctx, q, u.outbox, organizationID, instance.Slug, write, event, previous); err != nil {
			return err
		}
	}
	return nil
}

// ResetPeriodMax starts the period that begins at a composed boundary, or at
// a subscribe, with each active attachment's highest quantity at the one it
// holds (V31-70): what an ADVANCE true-up measures from there.
func (u *UseCase) ResetPeriodMax(ctx context.Context, organizationID, instanceID uuid.UUID) error {
	return u.deps.Queries(ctx).ResetPeriodMaxQuantity(ctx, db.ResetPeriodMaxQuantityParams{OrganizationID: organizationID, InstanceID: instanceID})
}
