package listaddonfamilies

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the organization's add-on families with their versions.
func (u *UseCase) Execute(ctx context.Context) ([]catalogue.AddonFamily, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	rows, err := q.ListAddonFamilies(ctx, user.OrganizationID)
	if err != nil {
		return nil, err
	}
	return catalogue.Families(ctx, q, user.OrganizationID, rows)
}
