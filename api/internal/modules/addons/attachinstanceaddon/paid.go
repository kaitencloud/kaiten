package attachinstanceaddon

import (
	"context"
	"errors"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
)

// AttachPaid creates, inside the caller's transaction, an attachment an
// INCOMPLETE checkout's payment applies (§9.10 rule 3): under the id its
// ACTIVATION line names, at the quantity selected, by actorID, with
// instance.addon.v1.added. Nothing is re-validated -- the ACTIVATION already
// priced it -- and nothing refuses it (§24 #65): an add-on archived since, or
// a version of its family attached meanwhile, leaves no row and a warning,
// and the payment goes on.
func (u *UseCase) AttachPaid(ctx context.Context, organizationID, actorID uuid.UUID, instanceSlug string, id uuid.UUID, addonSlug string, quantity int32) error {
	q := u.deps.Queries(ctx)
	instance, err := catalogue.LockInstance(ctx, q, organizationID, instanceSlug, operation)
	if err != nil {
		return err
	}
	addon, err := q.GetAddonBySlug(ctx, db.GetAddonBySlugParams{OrganizationID: organizationID, Slug: addonSlug})
	if errors.Is(err, pgx.ErrNoRows) {
		slog.WarnContext(ctx, "paid checkout: the add-on it bought no longer exists", "addon_slug", addonSlug, "instance_addon_id", id)
		return nil
	}
	if err != nil {
		return err
	}
	if addon.LifecycleState == db.LicenseLifecycleStateARCHIVED {
		slog.WarnContext(ctx, "paid checkout: the add-on it bought was archived since, so it is not attached", "addon_slug", addonSlug, "instance_addon_id", id)
		return nil
	}
	attachedID, err := q.InsertPaidInstanceAddon(ctx, db.InsertPaidInstanceAddonParams{
		ID: id, OrganizationID: organizationID, InstanceID: instance.ID, AddonID: addon.ID, AddonFamilyID: addon.FamilyID,
		Quantity: quantity, UserID: actorID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		slog.WarnContext(ctx, "paid checkout: a version of the add-on's family is attached already", "addon_slug", addonSlug, "instance_addon_id", id)
		return nil
	}
	if err != nil {
		return err
	}
	sub, err := catalogue.LiveSubscription(ctx, q, organizationID, instance.ID)
	if err != nil {
		return err
	}
	write := catalogue.AttachmentWrite{Instance: instance, Subscription: sub, Attachment: db.LockActiveInstanceAddonRow{
		ID: attachedID, AddonID: addon.ID, Quantity: quantity, MaxQuantity: addon.MaxQuantity,
	}}
	_, err = catalogue.AnnounceAttachment(ctx, q, u.outbox, organizationID, instanceSlug, write, events.InstanceAddonAdded, nil)
	return err
}
