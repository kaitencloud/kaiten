package removeaddoncompatibility

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/infrastructure/outbox"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

const operation = "RemoveAddonCompatibility"

type UseCase struct {
	deps   catalogue.Deps
	outbox *outbox.ScopedRepository
}

func NewUseCase(deps catalogue.Deps) *UseCase {
	return &UseCase{deps: deps, outbox: outbox.NewScopedRepository(deps.Uof)}
}

// Execute records that the version no longer fits the licence family. Repeating it
// changes nothing and records nothing.
func (u *UseCase) Execute(ctx context.Context, addonSlug, familySlug string) error {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return err
	}
	return u.deps.Uof.Transact(ctx, func(ctx context.Context) error {
		q := u.deps.Queries(ctx)
		locked, err := catalogue.Lock(ctx, q, user.OrganizationID, addonSlug, operation+".AddonNotFound")
		if err != nil {
			return err
		}
		familyID, err := q.GetLicenseFamilyIDBySlug(ctx, db.GetLicenseFamilyIDBySlugParams{OrganizationID: user.OrganizationID, Slug: familySlug})
		if errors.Is(err, pgx.ErrNoRows) {
			return kaitenerrors.NotFoundf(operation+".FamilyNotFound", "license family %q not found", familySlug)
		}
		if err != nil {
			return err
		}
		before, err := q.ListAddonCompatibleFamilies(ctx, db.ListAddonCompatibleFamiliesParams{OrganizationID: user.OrganizationID, AddonID: locked.Row.ID})
		if err != nil {
			return err
		}
		if err := q.DeleteAddonCompatibility(ctx, db.DeleteAddonCompatibilityParams{
			AddonID: locked.Row.ID, LicenseFamilyID: familyID, OrganizationID: user.OrganizationID,
		}); err != nil {
			return err
		}
		after, err := q.ListAddonCompatibleFamilies(ctx, db.ListAddonCompatibleFamiliesParams{OrganizationID: user.OrganizationID, AddonID: locked.Row.ID})
		if err != nil {
			return err
		}
		if len(before) == len(after) {
			return nil
		}
		return catalogue.AnnounceUpdated(ctx, q, u.outbox, user.OrganizationID, locked.Addon(), []string{"compatibleLicenseFamilies"})
	})
}
