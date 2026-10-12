package listaddons

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists the organization's add-on versions, newest first.
func (u *UseCase) Execute(ctx context.Context, lifecycleState, familySlug, cursor string, limit int32) (pagination.Page[catalogue.Addon], error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return pagination.Page[catalogue.Addon]{}, err
	}
	page, err := pagination.ParseKeyset(cursor, limit, "Addons")
	if err != nil {
		return pagination.Page[catalogue.Addon]{}, err
	}
	return catalogue.List(ctx, u.deps.Queries(ctx), user.OrganizationID, lifecycleState, familySlug, page)
}
