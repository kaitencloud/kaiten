package catalogue

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/events"
	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	addonevents "github.com/kaitencloud/kaiten/api/internal/modules/addons/events"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

// Transition is one edge of an add-on version's lifecycle: publish, archive or
// unarchive. There is no edge back to DRAFT.
type Transition struct {
	Operation      string
	From, To       string
	Event          events.Metadata
	WrongStateCode string
}

// Move applies t to the version slug names, under its lock, and records the
// event.
func (t Transition) Move(ctx context.Context, deps Deps, box *outbox.ScopedRepository, slug string) (*Addon, error) {
	user, err := deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var moved Addon
	err = deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := deps.Queries(ctx)
		locked, err := Lock(ctx, q, user.OrganizationID, slug, t.Operation+".NotFound")
		if err != nil {
			return err
		}
		if string(locked.Row.LifecycleState) != t.From {
			return kaitenerrors.Conflict(t.WrongStateCode,
				fmt.Sprintf("add-on %q is %s, not %s", slug, locked.Row.LifecycleState, t.From))
		}
		if locked.Row.IsDefault && t.To != Published {
			return kaitenerrors.Conflict(t.Operation+".DefaultMustBePublished",
				fmt.Sprintf("add-on %q is its family's default, and a default must stay PUBLISHED; unset it first", slug))
		}
		row, err := q.SetAddonLifecycleState(ctx, db.SetAddonLifecycleStateParams{
			State: db.LicenseLifecycleState(t.To), UserID: user.ID, OrganizationID: user.OrganizationID, ID: locked.Row.ID,
		})
		if err != nil {
			return err
		}
		moved = ToAddon(row, locked.FamilySlug)
		return box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(user.OrganizationID, t.Event.Name, t.Event.Type, moved, nil))
	})
	if err != nil {
		return nil, err
	}
	return &moved, nil
}

// AnnounceUpdated records ADDON_UPDATED for a version, with the licence
// families it fits.
func AnnounceUpdated(ctx context.Context, q *db.Queries, box *outbox.ScopedRepository, organizationID uuid.UUID, addon Addon, changed []string) error {
	families, err := q.ListAddonCompatibleFamilies(ctx, db.ListAddonCompatibleFamiliesParams{OrganizationID: organizationID, AddonID: addon.ID})
	if err != nil {
		return err
	}
	if families == nil {
		families = []string{}
	}
	payload := AddonUpdate{Addon: addon, ChangedFields: changed, CompatibleLicenseFamilies: families}
	return box.CreateOutboxEvent(ctx, outbox.NewOutboxMessage(organizationID, addonevents.AddonUpdated.Name, addonevents.AddonUpdated.Type, payload, nil))
}
