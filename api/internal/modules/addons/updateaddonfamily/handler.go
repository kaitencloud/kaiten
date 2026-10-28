package updateaddonfamily

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Command is a family's settings to change; nil keeps the stored value.
type Command struct {
	IsPublic        *bool
	IncreaseBilling *string
}

// Execute changes the family's settings: whether it is listed publicly, and
// how a mid-period increase of its ADVANCE add-ons is billed (V31-70). A
// change is recorded as ADDON_UPDATED on each of the family's versions.
func (u *UseCase) Execute(ctx context.Context, familySlug string, cmd Command) (*catalogue.AddonFamily, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	ctx = u.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	increase, err := catalogue.ParseIncreaseBilling("UpdateAddonFamily", cmd.IncreaseBilling)
	if err != nil {
		return nil, err
	}
	var family catalogue.AddonFamily
	err = u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		before, err := q.LockAddonFamilyBySlug(ctx, db.LockAddonFamilyBySlugParams{OrganizationID: user.OrganizationID, Slug: familySlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf("UpdateAddonFamily.NotFound", "add-on family %q not found", familySlug)
		}
		if err != nil {
			return err
		}
		if !u.deps.AIPolicy.Enabled(ctx) && (cmd.IsPublic != nil || cmd.IncreaseBilling != nil) {
			hasAI, err := q.AddonFamilyHasAI(ctx, db.AddonFamilyHasAIParams{OrganizationID: user.OrganizationID, FamilyID: &before.ID, FamilySlug: nil})
			if err != nil {
				return err
			}
			if hasAI {
				return u.deps.AIPolicy.RequireEnabled(ctx)
			}
		}
		row, err := q.UpdateAddonFamilySettings(ctx, db.UpdateAddonFamilySettingsParams{
			IsPublic: cmd.IsPublic, IncreaseBilling: increase, OrganizationID: user.OrganizationID, Slug: familySlug,
		})
		if err != nil {
			return err
		}
		families, err := catalogue.Families(ctx, q, user.OrganizationID, []db.AddonFamily{row})
		if err != nil {
			return err
		}
		family = families[0]
		var changed []string
		if row.IsPublic != before.IsPublic {
			changed = append(changed, "isPublic")
		}
		if row.IncreaseBilling != before.IncreaseBilling {
			changed = append(changed, "increaseBilling")
		}
		if len(changed) == 0 {
			return nil
		}
		for _, version := range family.Versions {
			if err := catalogue.AnnounceUpdated(ctx, q, u.outbox, user.OrganizationID, version, changed); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &family, nil
}
