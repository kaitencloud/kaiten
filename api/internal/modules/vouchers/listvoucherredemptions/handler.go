package listvoucherredemptions

import (
	"context"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists a voucher's redemptions, newest first.
func (u *UseCase) Execute(ctx context.Context, voucherID uuid.UUID) ([]catalogue.Redemption, error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return nil, err
	}
	q := u.deps.Queries(ctx)
	if _, err := catalogue.One(ctx, q, user.OrganizationID, &voucherID, nil, false,
		kaitenerrors.NotFoundf("ListVoucherRedemptions.VoucherNotFound", "voucher %s not found", voucherID)); err != nil {
		return nil, err
	}
	return catalogue.Redemptions(ctx, q, db.ListRedemptionsParams{
		OrganizationID: user.OrganizationID, InstanceID: nil, VoucherID: &voucherID, ID: nil, Status: nil,
	})
}
