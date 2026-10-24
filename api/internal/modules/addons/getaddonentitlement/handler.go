package getaddonentitlement

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
)

const code = "GetAddonEntitlement.NotFound"

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads one grant of a version.
func (u *UseCase) Execute(ctx context.Context, addonSlug, entitlementSlug string) (*catalogue.AddonEntitlement, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	addon, err := catalogue.Get(ctx, q, user.OrganizationID, addonSlug, code)
	if err != nil {
		return nil, err
	}
	row, err := catalogue.LockedGrant(ctx, q, user.OrganizationID, addon.ID, entitlementSlug, code)
	if err != nil {
		return nil, err
	}
	grant := catalogue.ToGrant(row)
	return &grant, nil
}
