package updateaddon

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "UpdateAddon"

// AddonChanges is what an update replaces. Absent members are cleared, as a PUT
// does: versionName to its default, maxQuantity to unbounded.
type AddonChanges struct {
	Name        string  `json:"name" minLength:"1" example:"Extra seats"`
	Description string  `json:"description"`
	VersionName *string `json:"versionName,omitempty"`
	IsDefault   bool    `json:"isDefault"`
	MaxQuantity *int32  `json:"maxQuantity,omitempty"`
}

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute replaces the version's editable members.
func (u *UseCase) Execute(ctx context.Context, slug string, command AddonChanges) (*catalogue.Addon, error) {
	if err := catalogue.ValidateMaxQuantity(operation, command.MaxQuantity); err != nil {
		return nil, err
	}
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	var updated catalogue.Addon
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		locked, err := catalogue.Lock(ctx, q, user.OrganizationID, slug, operation+".NotFound")
		if err != nil {
			return err
		}
		before := locked.Addon()
		if command.IsDefault && before.LifecycleState != catalogue.Published {
			return catalogue.DefaultMustBePublished(operation)
		}
		if command.IsDefault && !before.IsDefault {
			if err := q.ClearAddonFamilyDefault(ctx, db.ClearAddonFamilyDefaultParams{
				UserID: user.ID, OrganizationID: user.OrganizationID, FamilyID: locked.Row.FamilyID, ExceptID: locked.Row.ID,
			}); err != nil {
				return err
			}
		}
		versionName := catalogue.DefaultName(locked.Row.Version)
		if command.VersionName != nil {
			versionName = *command.VersionName
		}
		row, err := q.UpdateAddon(ctx, db.UpdateAddonParams{
			Name: command.Name, Description: command.Description, VersionName: &versionName,
			IsDefault: command.IsDefault, MaxQuantity: command.MaxQuantity, UserID: user.ID,
			OrganizationID: user.OrganizationID, ID: locked.Row.ID,
		})
		if kaitenerrors.IsUniqueViolationOnConstraint(err, "addon_family_id_is_default_key") {
			return kaitenerrors.Conflict(operation+".DefaultConflict", "another version of this family was made the default concurrently; retry")
		}
		if err != nil {
			return err
		}
		updated = catalogue.ToAddon(row, locked.FamilySlug)
		changed := changedFields(before, updated)
		if len(changed) == 0 {
			return nil
		}
		return catalogue.AnnounceUpdated(ctx, q, u.outbox, user.OrganizationID, updated, changed)
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

func changedFields(before, after catalogue.Addon) []string {
	var changed []string
	if before.Name != after.Name {
		changed = append(changed, "name")
	}
	if before.Description != after.Description {
		changed = append(changed, "description")
	}
	if before.VersionName != after.VersionName {
		changed = append(changed, "versionName")
	}
	if before.IsDefault != after.IsDefault {
		changed = append(changed, "isDefault")
	}
	if (before.MaxQuantity == nil) != (after.MaxQuantity == nil) ||
		(before.MaxQuantity != nil && *before.MaxQuantity != *after.MaxQuantity) {
		changed = append(changed, "maxQuantity")
	}
	return changed
}
