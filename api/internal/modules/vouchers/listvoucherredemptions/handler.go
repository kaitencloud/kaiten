package listvoucherredemptions

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/catalogue"
	"github.com/kaitencloud/kaiten/api/internal/modules/vouchers/infrastructure/db"
	"github.com/kaitencloud/kaiten/api/internal/shared/pagination"
	kaitenerrors "github.com/kaitencloud/kaiten/api/pkg/apierrors"
)

type UseCase struct{ deps catalogue.Deps }

func NewUseCase(deps catalogue.Deps) *UseCase { return &UseCase{deps: deps} }

// Execute lists a voucher's redemptions, newest first.
func (u *UseCase) Execute(ctx context.Context, voucherID uuid.UUID, cursor string, limit int32) (pagination.Page[catalogue.Redemption], error) {
	user, err := u.deps.Caller(ctx)
	if err != nil {
		return pagination.Page[catalogue.Redemption]{}, err
	}
	page, err := pagination.ParseKeyset(cursor, limit, "VoucherRedemptions")
	if err != nil {
		return pagination.Page[catalogue.Redemption]{}, err
	}
	q := u.deps.Queries(ctx)
	if _, err := catalogue.One(ctx, q, user.OrganizationID, &voucherID, nil, false,
		kaitenerrors.NotFoundf("ListVoucherRedemptions.VoucherNotFound", "voucher %s not found", voucherID)); err != nil {
		return pagination.Page[catalogue.Redemption]{}, err
	}
	redemptions, err := catalogue.Redemptions(ctx, q, db.ListRedemptionsParams{
		OrganizationID: user.OrganizationID, InstanceID: nil, VoucherID: &voucherID, ID: nil, Status: nil,
		CursorAt: page.CursorAt, CursorID: page.CursorID, RowLimit: page.RowLimit,
	})
	if err != nil {
		return pagination.Page[catalogue.Redemption]{}, err
	}
	return pagination.KeysetPage(redemptions, page, func(r catalogue.Redemption) (time.Time, uuid.UUID) { return r.RedeemedAt, r.ID })
}
