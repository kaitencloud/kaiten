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

// Execute lists the family publicly, or takes it out. The change is recorded
// as ADDON_UPDATED on each of the family's versions.
func (u *UseCase) Execute(ctx context.Context, familySlug string, isPublic bool) (*catalogue.AddonFamily, error) {
	user, err := u.deps.Caller(ctx)
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
		row, err := q.SetAddonFamilyPublic(ctx, db.SetAddonFamilyPublicParams{
			IsPublic: isPublic, OrganizationID: user.OrganizationID, Slug: familySlug,
		})
		if err != nil {
			return err
		}
		families, err := catalogue.Families(ctx, q, user.OrganizationID, []db.AddonFamily{row})
		if err != nil {
			return err
		}
		family = families[0]
		if before.IsPublic == isPublic {
			return nil
		}
		for _, version := range family.Versions {
			if err := catalogue.AnnounceUpdated(ctx, q, u.outbox, user.OrganizationID, version, []string{"isPublic"}); err != nil {
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
