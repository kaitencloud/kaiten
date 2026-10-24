package detachinstanceaddon

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
)

// RemoveForFallback removes, inside the caller's transaction, the add-ons a
// fallback move strands (§9.11 rule 3, proposed §24 #69): every attachment
// whose add-on version is not compatible with the family of licenseID, the
// version the instance now holds, removed at the given instant by actorID, each with
// instance.addon.v1.removed. A compatible attachment stays. Nothing refuses
// it: the cancellation it follows is never refused.
func (u *UseCase) RemoveForFallback(ctx context.Context, organizationID, actorID uuid.UUID, instanceSlug string, licenseID uuid.UUID, at time.Time) error {
	q := u.deps.Queries(ctx)
	instance, err := catalogue.LockInstance(ctx, q, organizationID, instanceSlug, operation)
	if err != nil {
		return err
	}
	stranded, err := q.LockAttachmentsIncompatibleWith(ctx, db.LockAttachmentsIncompatibleWithParams{
		OrganizationID: organizationID, InstanceID: instance.ID, LicenseID: licenseID,
	})
	if err != nil || len(stranded) == 0 {
		return err
	}
	sub, err := catalogue.LiveSubscription(ctx, q, organizationID, instance.ID)
	if err != nil {
		return err
	}
	removedAt := pgtype.Timestamp{Time: at.UTC(), InfinityModifier: pgtype.Finite, Valid: true}
	for _, row := range stranded {
		if err := q.RemoveInstanceAddonAt(ctx, db.RemoveInstanceAddonAtParams{
			At: removedAt, UserID: actorID, OrganizationID: organizationID, ID: row.ID,
		}); err != nil {
			return err
		}
		write := catalogue.AttachmentWrite{Instance: instance, Subscription: sub, Attachment: db.LockActiveInstanceAddonRow(row)}
		if _, err := catalogue.AnnounceAttachment(ctx, q, u.outbox, organizationID, instanceSlug, write, events.InstanceAddonRemoved, nil); err != nil {
			return err
		}
	}
	return nil
}
