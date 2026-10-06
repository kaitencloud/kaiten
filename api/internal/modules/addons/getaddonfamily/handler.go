package getaddonfamily

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads one add-on family with its versions.
func (u *UseCase) Execute(ctx context.Context, familySlug string) (*catalogue.AddonFamily, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	row, err := q.GetAddonFamilyBySlug(ctx, db.GetAddonFamilyBySlugParams{OrganizationID: user.OrganizationID, Slug: familySlug})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, kaitenerrors.NotFoundf("GetAddonFamily.NotFound", "add-on family %q not found", familySlug)
	}
	if err != nil {
		return nil, err
	}
	families, err := catalogue.Families(ctx, q, user.OrganizationID, []db.AddonFamily{row})
	if err != nil {
		return nil, err
	}
	return &families[0], nil
}
