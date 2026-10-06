package catalogue

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// LockInstance reads and locks the instance an attachment write names, with
// its licence family; <operation>.InstanceNotFound when the organization has
// none.
func LockInstance(ctx context.Context, q *db.Queries, organizationID uuid.UUID, slug, operation string) (db.LockInstanceForAddonsRow, error) {
	instance, err := q.LockInstanceForAddons(ctx, db.LockInstanceForAddonsParams{OrganizationID: organizationID, Slug: slug})
	if errors.Is(err, pgx.ErrNoRows) {
		return instance, kaitenerrors.NotFoundf(operation+".InstanceNotFound", "instance %q not found", slug)
	}
	return instance, err
}

// AttachmentWrite is what quantity changes and removals share: the instance
// locked, its live subscription, and the active attachment of addonSlug.
type AttachmentWrite struct {
	Instance     db.LockInstanceForAddonsRow
	Subscription *Subscription
	Attachment   db.LockActiveInstanceAddonRow
}

// LockAttachment reads and locks what a quantity change or a removal acts on;
// <operation>.NotAttached when the instance does not hold the add-on.
func LockAttachment(ctx context.Context, q *db.Queries, organizationID uuid.UUID, instanceSlug, addonSlug, operation string) (AttachmentWrite, error) {
	instance, err := LockInstance(ctx, q, organizationID, instanceSlug, operation)
	if err != nil {
		return AttachmentWrite{}, err
	}
	attachment, err := q.LockActiveInstanceAddon(ctx, db.LockActiveInstanceAddonParams{
		OrganizationID: organizationID, InstanceID: instance.ID, AddonSlug: addonSlug,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return AttachmentWrite{}, kaitenerrors.NotFoundf(operation+".NotAttached", "the instance does not hold add-on %q", addonSlug)
	}
	if err != nil {
		return AttachmentWrite{}, err
	}
	sub, err := LiveSubscription(ctx, q, organizationID, instance.ID)
	if err != nil {
		return AttachmentWrite{}, err
	}
	if err := RefuseBoundaryPending(operation, sub); err != nil {
		return AttachmentWrite{}, err
	}
	return AttachmentWrite{Instance: instance, Subscription: sub, Attachment: attachment}, nil
}

// AnnounceAttachment records an INSTANCE_ADDON_* event and returns the
// attachment as it stands.
func AnnounceAttachment(
	ctx context.Context, q *db.Queries, box *outbox.ScopedRepository, organizationID uuid.UUID,
	instanceSlug string, write AttachmentWrite, event events.Metadata, previous *int32,
) (InstanceAddon, error) {
	id := write.Attachment.ID
	attached, err := InstanceAddons(ctx, q, organizationID, write.Instance.ID, write.Subscription, true, &id)
	if err != nil {
		return InstanceAddon{}, err
	}
	if len(attached) == 0 {
		return InstanceAddon{}, pgx.ErrNoRows
	}
	payload := InstanceAddonUpdate{InstanceAddon: attached[0], InstanceSlug: instanceSlug, PreviousQuantity: previous}
	if err := box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID, event.Name, event.Type, payload, nil)); err != nil {
		return InstanceAddon{}, err
	}
	return attached[0], nil
}
