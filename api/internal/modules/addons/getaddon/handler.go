package getaddon

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/addons/catalogue"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads one add-on version.
func (u *UseCase) Execute(ctx context.Context, slug string) (*catalogue.Addon, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	addon, err := catalogue.Get(ctx, u.deps.Queries(ctx), user.OrganizationID, slug, "GetAddon.NotFound")
	if err != nil {
		return nil, err
	}
	return &addon, nil
}
