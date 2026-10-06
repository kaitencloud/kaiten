package listaddonentitlements

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/addons/infrastructure/db"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists what a version grants per unit.
func (u *UseCase) Execute(ctx context.Context, addonSlug string) ([]catalogue.AddonEntitlement, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	addon, err := catalogue.Get(ctx, q, user.OrganizationID, addonSlug, "ListAddonEntitlements.AddonNotFound")
	if err != nil {
		return nil, err
	}
	rows, err := q.ListAddonEntitlements(ctx, db.ListAddonEntitlementsParams{OrganizationID: user.OrganizationID, AddonID: addon.ID, EntitlementSlug: nil})
	if err != nil {
		return nil, err
	}
	grants := make([]catalogue.AddonEntitlement, len(rows))
	for i, row := range rows {
		grants[i] = catalogue.ToGrant(row)
	}
	return grants, nil
}
