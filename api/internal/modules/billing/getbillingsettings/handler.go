package getbillingsettings

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/billing/access"
	"github.com/kaitencloud/kaiten/api/internal/modules/billing/settings"
)

type UseCase struct {
	deps access.Deps
}

func NewUseCase(deps access.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads the organization's billing defaults.
func (u *UseCase) Execute(ctx context.Context) (*settings.BillingSettings, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	current, err := settings.Read(ctx, u.deps.Queries(ctx), user.OrganizationID)
	if err != nil {
		return nil, err
	}
	return &current, nil
}
