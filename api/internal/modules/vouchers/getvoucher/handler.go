package getvoucher

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute reads one voucher, with its code.
func (u *UseCase) Execute(ctx context.Context, voucherID uuid.UUID) (*catalogue.Voucher, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	ctx = u.deps.AIPolicy.Resolve(ctx, user.OrganizationID)
	voucher, err := catalogue.One(ctx, u.deps.Queries(ctx), user.OrganizationID, &voucherID, nil, true,
		kaitenerrors.NotFoundf("GetVoucher.NotFound", "voucher %s not found", voucherID))
	if err != nil {
		return nil, err
	}
	visible, err := catalogue.VisibleVoucher(ctx, u.deps.Queries(ctx), user.OrganizationID, u.deps.AIPolicy, voucher)
	if err != nil {
		return nil, err
	}
	return &visible, nil
}
