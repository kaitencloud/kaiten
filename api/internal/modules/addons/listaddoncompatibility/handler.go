package listaddoncompatibility

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
)

// CompatibleLicenseFamilies are the licence families an add-on version fits.
type CompatibleLicenseFamilies struct {
	FamilySlugs []string `json:"familySlugs" nullable:"false" example:"[\"pro\"]"`
}

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the licence families the version fits.
func (u *UseCase) Execute(ctx context.Context, addonSlug string) (*CompatibleLicenseFamilies, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	addon, err := catalogue.Get(ctx, q, user.OrganizationID, addonSlug, "ListAddonCompatibility.AddonNotFound")
	if err != nil {
		return nil, err
	}
	slugs, err := q.ListAddonCompatibleFamilies(ctx, db.ListAddonCompatibleFamiliesParams{OrganizationID: user.OrganizationID, AddonID: addon.ID})
	if err != nil {
		return nil, err
	}
	if slugs == nil {
		slugs = []string{}
	}
	return &CompatibleLicenseFamilies{FamilySlugs: slugs}, nil
}
