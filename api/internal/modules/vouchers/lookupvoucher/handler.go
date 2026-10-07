package lookupvoucher

import (
	"context"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute finds the voucher a code names.
func (u *UseCase) Execute(ctx context.Context, code string) (*catalogue.Voucher, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	voucher, err := catalogue.One(ctx, u.deps.Queries(ctx), user.OrganizationID, nil, &code, true,
		kaitenerrors.NotFound("LookupVoucher.NotFound", "no voucher has this code"))
	if err != nil {
		return nil, err
	}
	return &voucher, nil
}
